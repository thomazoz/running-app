import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

// --- MOCK DATA ---

// Helper to calculate distance between two coordinates in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchElevations(coordinates: number[][]) {
  const elevations: number[] = new Array(coordinates.length).fill(0);
  const chunkSize = 100;
  for (let i = 0; i < coordinates.length; i += chunkSize) {
    const chunk = coordinates.slice(i, i + chunkSize);
    const lats = chunk.map(c => c[1].toFixed(5)).join(',');
    const lons = chunk.map(c => c[0].toFixed(5)).join(',');
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`);
      const data = await res.json();
      if (data.elevation) {
        data.elevation.forEach((e: number, idx: number) => {
          elevations[i + idx] = e;
        });
      }
    } catch (e) {
      console.error("Elevation fetch failed", e);
    }
  }
  return elevations;
}

async function generateDynamicRoute(distanceKm: number, elevationPref: string, direction: string, startLat = 37.8719, startLng = -122.2585) {
  const latPerKm = 1 / 111;
  const lngPerKm = 1 / (111 * Math.cos(startLat * Math.PI / 180));

  let baseBearings: number[] = [];
  if (direction === 'north') baseBearings = [0, -Math.PI/6, Math.PI/6];
  else if (direction === 'east') baseBearings = [Math.PI/2, Math.PI/2 - Math.PI/6, Math.PI/2 + Math.PI/6];
  else if (direction === 'south') baseBearings = [Math.PI, Math.PI - Math.PI/6, Math.PI + Math.PI/6];
  else if (direction === 'west') baseBearings = [3*Math.PI/2, 3*Math.PI/2 - Math.PI/6, 3*Math.PI/2 + Math.PI/6];
  else baseBearings = [0, Math.PI/2, Math.PI, 3*Math.PI/2]; // 'any' -> try 4 directions

  const candidates: any[] = [];

  for (const centerBearing of baseBearings) {
    const startBearingFromCenter = centerBearing + Math.PI;
    const numWaypoints = 6;
    let currentRadiusKm = (distanceKm / 1.3) / (2 * Math.PI);
    
    let bestLocalRoute: any = null;
    let bestLocalDistanceDiff = Infinity;
    
    for (let iteration = 0; iteration < 3; iteration++) {
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

          let actualDistanceMeters = 0;
          for (let i = 1; i < osrmCoordinates.length; i++) {
            actualDistanceMeters += calculateDistance(
              osrmCoordinates[i-1][1], osrmCoordinates[i-1][0],
              osrmCoordinates[i][1], osrmCoordinates[i][0]
            );
          }
          const actualDistanceKm = actualDistanceMeters / 1000;
          const diff = Math.abs(actualDistanceKm - distanceKm);
          
          if (osrmCoordinates.length >= 2 && diff < bestLocalDistanceDiff) {
            bestLocalDistanceDiff = diff;
            bestLocalRoute = {
              coordinates: osrmCoordinates,
              distance: actualDistanceMeters
            };
          }
          
          if (diff / distanceKm < 0.05) break;
          
          const safeActualDistanceKm = Math.max(actualDistanceKm, 0.1);
          const ratio = distanceKm / safeActualDistanceKm;
          currentRadiusKm = currentRadiusKm * (0.5 + 0.5 * Math.min(ratio, 3));
        } else {
          break;
        }
      } catch (err) {
        console.error("Routing iteration error", err);
        break;
      }
    }
    
    if (bestLocalRoute) {
      candidates.push(bestLocalRoute);
    }
  }

  let bestOverallRoute: any = null;
  let bestOverallScore = Infinity;

  // Evaluate candidates
  for (const candidate of candidates) {
    const osrmCoordinates = candidate.coordinates;
    const realElevations = await fetchElevations(osrmCoordinates);
    
    let totalAscend = 0;
    let totalDescend = 0;
    let prevElevation = realElevations[0] || 50;
    const finalCoords = [];
    
    for (let i = 0; i < osrmCoordinates.length; i++) {
      const lng = osrmCoordinates[i][0];
      const lat = osrmCoordinates[i][1];
      let elevation = realElevations[i] || prevElevation;
      elevation = prevElevation * 0.7 + elevation * 0.3;
      
      if (i > 0) {
        const diff = elevation - prevElevation;
        if (diff > 0) totalAscend += diff;
        else totalDescend += Math.abs(diff);
      }
      finalCoords.push([lng, lat, elevation]);
      prevElevation = elevation;
    }
    
    const actualDistanceKm = candidate.distance / 1000;
    const distanceScore = Math.abs(actualDistanceKm - distanceKm) / distanceKm;
    
    const ascendPerKm = totalAscend / actualDistanceKm;
    let elevationScore = 0;
    if (elevationPref === 'flat') {
      elevationScore = Math.max(0, ascendPerKm - 10) / 20;
    } else if (elevationPref === 'moderate') {
      elevationScore = Math.abs(ascendPerKm - 35) / 35;
    } else if (elevationPref === 'hilly') {
      elevationScore = Math.max(0, 70 - ascendPerKm) / 70;
    }
    
    const totalScore = distanceScore * 2 + elevationScore;
    
    if (totalScore < bestOverallScore) {
      bestOverallScore = totalScore;
      bestOverallRoute = {
        coordinates: finalCoords,
        distance: candidate.distance,
        totalAscend,
        totalDescend
      };
    }
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
      
      if (i > 0) {
        const diff = elevation - prevElevation;
        if (diff > 0) totalAscend += diff;
        else totalDescend += Math.abs(diff);
      }
      
      coordinates.push([lng, lat, elevation]);
      prevElevation = elevation;
    }
    coordinates[coordinates.length - 1] = [...coordinates[0]];
    
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

  app.use(express.json());

  // --- API ENDPOINTS ---

  app.get('/api/v1/route', async (req, res) => {
    const elevation_pref = req.query.elevation_pref as string || 'moderate';
    const distanceVal = parseFloat(req.query.distance as string) || 5;
    const unit = req.query.unit as string || 'km';
    const direction = req.query.direction as string || 'any';
    const startLat = parseFloat(req.query.startLat as string) || 37.8719;
    const startLng = parseFloat(req.query.startLng as string) || -122.2585;
    
    const distanceKm = unit === 'mi' ? distanceVal * 1.60934 : distanceVal;
    
    try {
      const route = await generateDynamicRoute(distanceKm, elevation_pref, direction, startLat, startLng);
      res.json(route);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to generate route" });
    }
  });

  app.get('/api/v1/weather', (req, res) => {
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

  app.get('/api/v1/reverse-geocode', (req, res) => {
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
