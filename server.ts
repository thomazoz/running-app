import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { calculateDistance } from './src/utils';

// --- MOCK DATA ---

async function fetchElevations(coordinates: number[][]): Promise<number[]> {
  const result: (number | null)[] = new Array(coordinates.length).fill(null);
  const chunkSize = 50; // Smaller chunks to avoid URL length issues
  for (let i = 0; i < coordinates.length; i += chunkSize) {
    const chunk = coordinates.slice(i, i + chunkSize);
    const lats = chunk.map(c => c[1].toFixed(6)).join(',');
    const lons = chunk.map(c => c[0].toFixed(6)).join(',');
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`);
      if (!res.ok) { console.error(`Elevation API status ${res.status}`); continue; }
      const data = await res.json();
      if (Array.isArray(data.elevation)) {
        data.elevation.forEach((e: unknown, idx: number) => {
          if (typeof e === 'number' && isFinite(e)) result[i + idx] = e;
        });
      }
    } catch (e) {
      console.error('Elevation fetch failed:', e);
    }
  }

  // Linear interpolation over any null gaps (API returned null for those coords)
  let lastValidIdx = -1;
  for (let i = 0; i < result.length; i++) {
    if (result[i] !== null) {
      if (lastValidIdx >= 0 && i > lastValidIdx + 1) {
        const startVal = result[lastValidIdx]!;
        const endVal = result[i]!;
        for (let j = lastValidIdx + 1; j < i; j++) {
          const t = (j - lastValidIdx) / (i - lastValidIdx);
          result[j] = startVal + t * (endVal - startVal);
        }
      }
      lastValidIdx = i;
    }
  }
  // Fill any leading / trailing nulls with the nearest valid value
  const firstValid = result.find(e => e !== null) ?? 0;
  const lastValid = lastValidIdx >= 0 ? result[lastValidIdx] : 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) result[i] = i < (lastValidIdx >= 0 ? lastValidIdx : result.length) ? firstValid : lastValid;
  }

  return result as number[];
}

async function generateDynamicRoute(distanceKm: number, elevationPref: string, direction: string, startLat = 37.8719, startLng = -122.2585, endLat?: number, endLng?: number) {
  // Point-to-point: route directly from start to end without looping back
  if (endLat !== undefined && endLng !== undefined) {
    const coordStr = `${startLng.toFixed(5)},${startLat.toFixed(5)};${endLng.toFixed(5)},${endLat.toFixed(5)}`;
    let osrmCoords: number[][] = [];
    try {
      const response = await fetch(`https://router.project-osrm.org/route/v1/foot/${coordStr}?geometries=geojson&overview=full`);
      const data = await response.json();
      if (data.code === 'Ok' && data.routes?.length > 0) {
        const stack: number[][] = [];
        for (const coord of data.routes[0].geometry.coordinates) {
          let isSpike = false;
          const checkDepth = Math.min(stack.length - 1, 8);
          for (let i = 1; i <= checkDepth; i++) {
            const prev = stack[stack.length - i - 1];
            if (prev && calculateDistance(prev[1], prev[0], coord[1], coord[0]) < 15) {
              for (let j = 0; j < i; j++) stack.pop();
              isSpike = true;
              break;
            }
          }
          if (!isSpike) stack.push(coord);
        }
        osrmCoords = stack;
      }
    } catch (err) {
      console.error('Point-to-point routing error:', err);
    }
    // Fallback to straight-line interpolation if OSRM failed
    if (osrmCoords.length < 2) {
      const n = 30;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        osrmCoords.push([startLng + (endLng - startLng) * t, startLat + (endLat - startLat) * t]);
      }
    }
    const rawElev = await fetchElevations(osrmCoords);
    const smoothed = rawElev.map((_e, i, arr) => {
      const lo = Math.max(0, i - 2);
      const hi = Math.min(arr.length - 1, i + 2);
      const win = arr.slice(lo, hi + 1).sort((a, b) => a - b);
      return win[Math.floor(win.length / 2)];
    });
    let p2pAscend = 0, p2pDescend = 0;
    const MIN_DIFF = 1;
    const p2pCoords = osrmCoords.map((c, i) => {
      if (i > 0) {
        const diff = smoothed[i] - smoothed[i - 1];
        if (diff > MIN_DIFF) p2pAscend += diff;
        else if (diff < -MIN_DIFF) p2pDescend += Math.abs(diff);
      }
      return [c[0], c[1], smoothed[i]];
    });
    let p2pDist = 0;
    for (let i = 1; i < osrmCoords.length; i++) {
      p2pDist += calculateDistance(osrmCoords[i-1][1], osrmCoords[i-1][0], osrmCoords[i][1], osrmCoords[i][0]);
    }
    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          distance: Math.round(p2pDist),
          time: Math.round((p2pDist / 1000) * 6 * 60000),
          ascend: Math.round(p2pAscend),
          descend: Math.round(p2pDescend),
          profile: elevationPref,
          slope_segments: []
        },
        geometry: { type: "LineString", coordinates: p2pCoords }
      }]
    };
  }
  const latPerKm = 1 / 111;
  const lngPerKm = 1 / (111 * Math.cos(startLat * Math.PI / 180));

  let baseBearings: number[] = [];
  if (direction === 'north') baseBearings = [0, -Math.PI/6, Math.PI/6];
  else if (direction === 'east') baseBearings = [Math.PI/2, Math.PI/2 - Math.PI/6, Math.PI/2 + Math.PI/6];
  else if (direction === 'south') baseBearings = [Math.PI, Math.PI - Math.PI/6, Math.PI + Math.PI/6];
  else if (direction === 'west') baseBearings = [3*Math.PI/2, 3*Math.PI/2 - Math.PI/6, 3*Math.PI/2 + Math.PI/6];
  else baseBearings = [0, Math.PI/2, Math.PI, 3*Math.PI/2]; // 'any' -> try 4 directions

  // Run all bearing directions concurrently; each does its own binary search on radius.
  const searchOneBearing = async (centerBearing: number): Promise<any | null> => {
    const startBearingFromCenter = centerBearing + Math.PI;
    const numWaypoints = 6;
    const nominalRadius = (distanceKm / 1.3) / (2 * Math.PI);

    let bestLocalRoute: any = null;
    let bestLocalDistanceDiff = Infinity;
    let loRadius = nominalRadius / 5;
    let hiRadius = nominalRadius * 8;

    for (let iteration = 0; iteration < 8; iteration++) {
      const currentRadiusKm = (loRadius + hiRadius) / 2;

      const centerLat = startLat + Math.cos(centerBearing) * currentRadiusKm * latPerKm;
      const centerLng = startLng + Math.sin(centerBearing) * currentRadiusKm * lngPerKm;

      const waypoints = [];
      for (let i = 0; i <= numWaypoints; i++) {
        const angle = startBearingFromCenter + (i * 2 * Math.PI / numWaypoints);
        const wpLat = centerLat + Math.cos(angle) * currentRadiusKm * latPerKm;
        const wpLng = centerLng + Math.sin(angle) * currentRadiusKm * lngPerKm;
        waypoints.push([wpLng, wpLat]);
      }

      try {
        const coordinatesString = waypoints.map(wp => `${wp[0].toFixed(5)},${wp[1].toFixed(5)}`).join(';');
        const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${coordinatesString}?geometries=geojson&overview=full`;

        const response = await fetch(osrmUrl);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          let osrmCoordinates = data.routes[0].geometry.coordinates;

          // Remove spikes
          const stack: number[][] = [];
          for (const coord of osrmCoordinates) {
            let isSpike = false;
            const checkDepth = Math.min(stack.length - 1, 8);
            for (let i = 1; i <= checkDepth; i++) {
              const prev = stack[stack.length - i - 1];
              if (prev && calculateDistance(prev[1], prev[0], coord[1], coord[0]) < 15) {
                for (let j = 0; j < i; j++) stack.pop();
                isSpike = true;
                break;
              }
            }
            if (!isSpike) stack.push(coord);
          }
          osrmCoordinates = stack;

          // Use OSRM's authoritative distance field for the binary search pivot
          const osrmReportedKm = (data.routes[0].distance ?? 0) / 1000;
          let actualDistanceMeters = 0;
          for (let i = 1; i < osrmCoordinates.length; i++) {
            actualDistanceMeters += calculateDistance(
              osrmCoordinates[i-1][1], osrmCoordinates[i-1][0],
              osrmCoordinates[i][1], osrmCoordinates[i][0]
            );
          }
          const actualDistanceKm = osrmReportedKm > 0 ? osrmReportedKm : actualDistanceMeters / 1000;
          const diff = Math.abs(actualDistanceKm - distanceKm);

          if (osrmCoordinates.length >= 2 && diff < bestLocalDistanceDiff) {
            bestLocalDistanceDiff = diff;
            bestLocalRoute = { coordinates: osrmCoordinates, distance: actualDistanceMeters };
          }

          if (diff / distanceKm < 0.05) break;

          // Binary search pivot: shrink if too long, expand if too short
          if (actualDistanceKm > distanceKm) hiRadius = currentRadiusKm;
          else loRadius = currentRadiusKm;
        } else {
          break;
        }
      } catch (err) {
        console.error("Routing iteration error", err);
        break;
      }
    }

    return bestLocalRoute;
  };

  const bearingResults = await Promise.all(baseBearings.map(b => searchOneBearing(b)));
  const candidates = bearingResults.filter(Boolean);

  // Pick the best candidate by distance accuracy only — elevation is fetched once
  // after selection to avoid multiple API calls (which can hit rate limits and corrupt data).
  let bestCandidate: any = null;
  let bestDistanceDiff = Infinity;
  for (const candidate of candidates) {
    const diff = Math.abs(candidate.distance / 1000 - distanceKm);
    if (diff < bestDistanceDiff) {
      bestDistanceDiff = diff;
      bestCandidate = candidate;
    }
  }

  let bestOverallRoute: any = null;

  if (bestCandidate) {
    const osrmCoordinates = bestCandidate.coordinates;
    const rawElevations = await fetchElevations(osrmCoordinates);
    console.log(`[elevation] fetched ${rawElevations.length} points, first=${rawElevations[0]?.toFixed(1)}m last=${rawElevations[rawElevations.length-1]?.toFixed(1)}m`);

    // 5-point variable-width median filter — includes endpoints using available neighbours
    const smoothed = rawElevations.map((_e, i, arr) => {
      const lo = Math.max(0, i - 2);
      const hi = Math.min(arr.length - 1, i + 2);
      const win = arr.slice(lo, hi + 1).sort((a, b) => a - b);
      return win[Math.floor(win.length / 2)];
    });

    // All routes are loops by design — the last point is physically at the same
    // location as the first point. Force them to the same elevation so the chart closes.
    smoothed[smoothed.length - 1] = smoothed[0];

    let totalAscend = 0;
    let totalDescend = 0;
    const MIN_ELEV_DIFF = 1; // ignore sub-1 m DEM noise in ascend/descend totals
    const finalCoords = osrmCoordinates.map((coord: number[], i: number) => {
      if (i > 0) {
        const diff = smoothed[i] - smoothed[i - 1];
        if (diff > MIN_ELEV_DIFF) totalAscend += diff;
        else if (diff < -MIN_ELEV_DIFF) totalDescend += Math.abs(diff);
      }
      return [coord[0], coord[1], smoothed[i]];
    });

    console.log(`[elevation] ascend=${totalAscend.toFixed(0)}m descend=${totalDescend.toFixed(0)}m startElev=${smoothed[0].toFixed(1)}m endElev=${smoothed[smoothed.length-1].toFixed(1)}m`);

    bestOverallRoute = {
      coordinates: finalCoords,
      distance: bestCandidate.distance,
      totalAscend,
      totalDescend
    };
  }

  let coordinates = [];
  let actualDistance = 0;
  let totalAscend = 0;
  let totalDescend = 0;

  if (bestOverallRoute) {
    coordinates = bestOverallRoute.coordinates;
    actualDistance = bestOverallRoute.distance;
    totalAscend = bestOverallRoute.totalAscend;
    totalDescend = bestOverallRoute.totalDescend;
  } else {
    console.error("Routing error, falling back to direct generation");
    // Fallback to the old generation logic if OSRM fails
    const numPoints = Math.max(40, Math.floor(distanceKm * 15));
    const rawPoints = [];
    const seed = Math.random() * 100;
    const fallbackBearing = baseBearings[0];
    const fallbackRadiusKm = (distanceKm / 1.3) / (2 * Math.PI);
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const angle = fallbackBearing + Math.PI + t * 2 * Math.PI;
      const noise = 1.0 + 0.1 * Math.sin(t * Math.PI * 2 + seed);
      const r = fallbackRadiusKm * noise;
      const dLat = Math.cos(angle) * r;
      const dLng = Math.sin(angle) * r;
      rawPoints.push({ dLat, dLng });
    }
    
    const shiftLat = -rawPoints[0].dLat;
    const shiftLng = -rawPoints[0].dLng;
    
    let prevElevation = 50;
    for (let i = 0; i <= numPoints; i++) {
      const pt = rawPoints[i];
      const lat = startLat + (pt.dLat + shiftLat) * latPerKm;
      const lng = startLng + (pt.dLng + shiftLng) * lngPerKm;

      const distEastKm = (lng - startLng) / lngPerKm;

      let targetElevation = 50;
      if (elevationPref === 'hilly') {
        targetElevation = 50 + distEastKm * 120;
        targetElevation += Math.sin(i * 0.5) * 20;
      } else if (elevationPref === 'moderate') {
        targetElevation = 50 + distEastKm * 40;
        targetElevation += Math.sin(i * 0.3) * 10;
      } else { // flat
        targetElevation = 50 + distEastKm * 5;
        targetElevation += Math.sin(i * 0.2) * 2;
      }

      targetElevation = Math.max(5, targetElevation);
      const elevation = i === 0 ? targetElevation : prevElevation * 0.8 + targetElevation * 0.2;

      coordinates.push([lng, lat, elevation]);
      prevElevation = elevation;
    }
    // Force loop closure, then recalculate ascend/descend from corrected coords
    coordinates[coordinates.length - 1] = [...coordinates[0]];
    for (let i = 1; i < coordinates.length; i++) {
      const diff = coordinates[i][2] - coordinates[i - 1][2];
      if (diff > 0) totalAscend += diff;
      else totalDescend += Math.abs(diff);
    }
    
    for (let i = 1; i < coordinates.length; i++) {
      actualDistance += calculateDistance(
        coordinates[i-1][1], coordinates[i-1][0],
        coordinates[i][1], coordinates[i][0]
      );
    }
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          distance: Math.round(actualDistance),
          time: Math.round((actualDistance / 1000) * 6 * 60000),
          ascend: Math.round(totalAscend),
          descend: Math.round(totalDescend),
          profile: elevationPref,
          slope_segments: []
        },
        geometry: {
          type: "LineString",
          coordinates
        }
      }
    ]
  };
}

// 3. Open-Meteo Mock
const MOCK_WEATHER = {
  temperature: 65,
  unit: "F",
  condition: "Clear",
  precipitation: 0,
  wind_speed: 5,
  wind_direction: "NW",
  aqi: 42,
  comfort_score: 85
};

// 4. Nominatim Mock
const MOCK_GEOCODE = {
  "uc berkeley": { lat: 37.8719, lon: -122.2585, display_name: "UC Berkeley, Berkeley, CA" },
  "tilden park": { lat: 37.8936, lon: -122.2520, display_name: "Tilden Regional Park, Berkeley, CA" },
  "berkeley marina": { lat: 37.8655, lon: -122.3146, display_name: "Berkeley Marina, Berkeley, CA" },
  "claremont hotel": { lat: 37.8617, lon: -122.2428, display_name: "Claremont Club & Spa, Berkeley, CA" },
  "indian rock": { lat: 37.8926, lon: -122.2731, display_name: "Indian Rock Park, Berkeley, CA" }
};

async function startServer() {
  const app = express();
  const PORT = 3000;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  app.use(express.json());

  // --- AI PROXY ENDPOINTS ---

  app.post('/api/v1/ai/advice', async (req, res) => {
    const { type, lat, lng } = req.body;
    try {
      const prompt = type === 'scenic' 
        ? "What are 3 good scenic parks, trails, or running paths nearby? Please list them clearly."
        : "What are some areas nearby that might have safety concerns for pedestrians or runners at night? Please list them clearly.";

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          tools: [{googleMaps: {}}],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng
              }
            }
          }
        } as any,
      });

      const text = response.text;
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const places = chunks
        .filter((c: any) => c.maps && c.maps.title)
        .map((c: any) => ({
          title: c.maps.title,
          uri: c.maps.uri,
        }));

      res.json({ text: text || '', places });
    } catch (err) {
      console.error("Failed to get AI advice", err);
      res.status(500).json({ error: "Failed to get AI advice" });
    }
  });

  app.post('/api/v1/ai/coaching', async (req, res) => {
    const { goalType, fitnessLevel, daysPerWeek, totalWeeks, weekNumber, phase, weekSummary } = req.body;
    try {
      const prompt = `I'm starting a ${goalType} training plan. I'm at ${fitnessLevel} level, running ${daysPerWeek} days per week. My plan is ${totalWeeks} weeks long. This week (week ${weekNumber}, ${phase} phase), my runs are: ${weekSummary}. Give me 3 short coaching tips for this week — what to focus on, common mistakes to avoid, and a motivational note. Keep it concise.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });
      
      res.json({ text: response.text || "No advice generated." });
    } catch (err) {
      console.error("Failed to get AI coaching", err);
      res.status(500).json({ error: "Failed to get AI coaching" });
    }
  });

  // --- API ENDPOINTS ---

  app.get('/api/v1/route', async (req, res) => {
    const elevation_pref = req.query.elevation_pref as string || 'moderate';
    const distanceVal = parseFloat(req.query.distance as string) || 5;
    const unit = req.query.unit as string || 'km';
    const direction = req.query.direction as string || 'any';
    const startLat = parseFloat(req.query.startLat as string) || 37.8719;
    const startLng = parseFloat(req.query.startLng as string) || -122.2585;
    const endLat = req.query.endLat ? parseFloat(req.query.endLat as string) : undefined;
    const endLng = req.query.endLng ? parseFloat(req.query.endLng as string) : undefined;

    const distanceKm = unit === 'mi' ? distanceVal * 1.60934 : distanceVal;

    try {
      const route = await generateDynamicRoute(distanceKm, elevation_pref, direction, startLat, startLng, endLat, endLng);
      res.json(route);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to generate route" });
    }
  });

  app.get('/api/v1/weather', (_req, res) => {
    res.json(MOCK_WEATHER);
  });

  app.get('/api/v1/geocode', (req, res) => {
    const q = (req.query.q as string || "").toLowerCase();
    const result = MOCK_GEOCODE[q as keyof typeof MOCK_GEOCODE];
    if (result) {
      res.json([result]);
    } else {
      // Default fallback
      res.json([{ lat: 37.8715, lon: -122.2730, display_name: "Berkeley, CA" }]);
    }
  });

  app.get('/api/v1/reverse-geocode', (_req, res) => {
    res.json({ display_name: "Berkeley, CA" });
  });

  // --- VITE MIDDLEWARE ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
