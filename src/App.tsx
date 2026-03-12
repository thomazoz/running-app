import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Polygon, Marker, Popup, useMap, useMapEvents, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, Map as MapIcon, Mountain, Shield, Sun, Wind, Navigation, Settings2, Compass, Search, MapPin, LocateFixed, Sparkles, Calendar, X, ChevronDown } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from '@google/genai';

// Utility for Tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- TYPES ---
type RouteFeature = {
  properties: {
    distance: number;
    time: number;
    ascend: number;
    descend: number;
    profile: string;
    slope_segments: { start: number; end: number; slope: number }[];
  };
  geometry: {
    coordinates: [number, number, number][]; // lng, lat, elevation
  };
};

type WeatherData = {
  temperature: number;
  unit: string;
  condition: string;
  precipitation: number;
  wind_speed: number;
  wind_direction: string;
  aqi: number;
  comfort_score: number;
};

type TrainingPlan = {
  planName: string;
  goalType: string;
  totalWeeks: number;
  weeks: {
    weekNumber: number;
    phase: 'base' | 'build' | 'peak' | 'taper';
    isStepBack: boolean;
    weeklyDistanceKm: number;
    days: {
      date: string;
      dayOfWeek: string;
      runType: 'easy' | 'long' | 'tempo' | 'intervals' | 'hill_repeats' | 'recovery' | 'rest';
      distanceKm: number;
      intensity: 'low' | 'high' | 'rest';
      paceGuidance: string;
      elevationPref: 'flat' | 'moderate' | 'hilly';
      suggestedBearing: string;
      notes: string;
    }[];
  }[];
  summary: {
    totalDistanceKm: number;
    peakWeekKm: number;
    phases: { base: number; build: number; peak: number; taper: number };
  };
};

// --- COMPONENTS ---

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

// Map Updater Component
function MapUpdater({ route }: { route: RouteFeature | null }) {
  const map = useMap();
  useEffect(() => {
    if (route && route.geometry.coordinates.length > 0) {
      const bounds = route.geometry.coordinates.map(c => [c[1], c[0]] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [route, map]);
  return null;
}

function MapEvents({ setStartLocation }: { setStartLocation: (loc: {lat: number, lng: number}) => void }) {
  useMapEvents({
    click(e) {
      setStartLocation({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function MapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function App() {
  const [distance, setDistance] = useState(5);
  const [unit, setUnit] = useState<'km' | 'mi'>('km');
  const [elevationPref, setElevationPref] = useState<'flat' | 'moderate' | 'hilly'>('moderate');
  const [direction, setDirection] = useState('any');
  const [startLocation, setStartLocation] = useState<{lat: number, lng: number} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const [route, setRoute] = useState<RouteFeature | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  
  const [aiAdvice, setAiAdvice] = useState<{text: string, places: {title: string, uri: string}[]} | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [mode, setMode] = useState<'single' | 'plan'>('single');
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    goalType: 'Half Marathon',
    targetDate: new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fitnessLevel: 'Intermediate',
    daysPerWeek: 4,
    preferredDays: ['tuesday', 'thursday', 'saturday', 'sunday']
  });
  const [expandedWeek, setExpandedWeek] = useState<number>(1);
  const [planPanelOpen, setPlanPanelOpen] = useState(false);

  const generateTrainingPlan = () => {
    let totalWeeks = 8;
    if (planForm.goalType !== 'General Fitness') {
      const today = new Date();
      const target = new Date(planForm.targetDate);
      const diffTime = Math.abs(target.getTime() - today.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      totalWeeks = Math.max(4, Math.ceil(diffDays / 7));
    }

    let peakKm = 40;
    const goal = planForm.goalType;
    const fitness = planForm.fitnessLevel;
    
    if (goal === '5K') {
      peakKm = fitness === 'Beginner' ? 25 : fitness === 'Intermediate' ? 40 : 55;
    } else if (goal === '10K') {
      peakKm = fitness === 'Beginner' ? 35 : fitness === 'Intermediate' ? 50 : 70;
    } else if (goal === 'Half Marathon') {
      peakKm = fitness === 'Beginner' ? 45 : fitness === 'Intermediate' ? 60 : 85;
    } else if (goal === 'Marathon') {
      peakKm = fitness === 'Beginner' ? 55 : fitness === 'Intermediate' ? 75 : 110;
    } else {
      peakKm = fitness === 'Beginner' ? 25 : fitness === 'Intermediate' ? 40 : 55;
    }

    const weeks: TrainingPlan['weeks'] = [];
    let actualPeakKm = 0;
    let phases = { base: 0, build: 0, peak: 0, taper: 0 };

    const directions = ['north', 'east', 'south', 'west'];
    let dirIndex = 0;
    
    const today = new Date();
    const startDate = new Date(today);
    const day = startDate.getDay();
    const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
    startDate.setDate(diff);

    for (let w = 1; w <= totalWeeks; w++) {
      let phase: 'base' | 'build' | 'peak' | 'taper' = 'base';
      const progress = w / totalWeeks;
      
      if (goal === 'General Fitness') {
        phase = progress < 0.5 ? 'base' : 'build';
      } else {
        if (progress > 0.9) phase = 'taper';
        else if (progress > 0.7) phase = 'peak';
        else if (progress > 0.4) phase = 'build';
      }
      phases[phase]++;

      const isStepBack = w % 4 === 0 && w < totalWeeks - 1;

      let weeklyTargetKm = 0;
      if (phase === 'base') {
        const baseStart = peakKm * 0.5;
        const baseEnd = peakKm * 0.8;
        const baseProgress = w / (totalWeeks * 0.4);
        weeklyTargetKm = baseStart + (baseEnd - baseStart) * baseProgress;
      } else if (phase === 'build') {
        const buildStart = peakKm * 0.8;
        const buildEnd = peakKm;
        const buildProgress = (w - totalWeeks * 0.4) / (totalWeeks * 0.3);
        weeklyTargetKm = buildStart + (buildEnd - buildStart) * buildProgress;
      } else if (phase === 'peak') {
        weeklyTargetKm = peakKm * 0.95;
      } else {
        const taperProgress = (w - totalWeeks * 0.9) / (totalWeeks * 0.1);
        weeklyTargetKm = peakKm * (0.6 - 0.3 * taperProgress);
      }

      if (isStepBack) {
        weeklyTargetKm *= 0.75;
      }

      weeklyTargetKm = Math.round(weeklyTargetKm);
      actualPeakKm = Math.max(actualPeakKm, weeklyTargetKm);

      const days: TrainingPlan['weeks'][0]['days'] = [];
      const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      let remainingKm = weeklyTargetKm;
      const runDays = planForm.preferredDays.length;
      
      const longRunDay = planForm.preferredDays[planForm.preferredDays.length - 1];
      let longRunKm = Math.round(weeklyTargetKm * (goal === 'Marathon' ? 0.35 : 0.3));
      if (longRunKm > 35) longRunKm = 35;
      
      let hardSessionsAllowed = fitness === 'Beginner' ? 1 : fitness === 'Intermediate' ? 2 : 3;
      if (phase === 'base' || phase === 'taper' || isStepBack) hardSessionsAllowed = Math.max(0, hardSessionsAllowed - 1);
      
      let hardSessionsAssigned = 0;
      let lastWasHard = false;

      for (let d = 0; d < 7; d++) {
        const dayName = daysOfWeek[d];
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + (w - 1) * 7 + d);
        
        if (!planForm.preferredDays.includes(dayName)) {
          days.push({
            date: currentDate.toISOString(),
            dayOfWeek: dayName,
            runType: 'rest',
            distanceKm: 0,
            intensity: 'rest',
            paceGuidance: 'Rest and recover.',
            elevationPref: 'flat',
            suggestedBearing: 'any',
            notes: ''
          });
          continue;
        }

        let runType: TrainingPlan['weeks'][0]['days'][0]['runType'] = 'easy';
        let distance = 0;
        let intensity: 'low' | 'high' = 'low';
        let paceGuidance = "Conversational pace — you can hold a full conversation";
        let elev: 'flat' | 'moderate' | 'hilly' = 'flat';

        if (dayName === longRunDay) {
          runType = 'long';
          distance = longRunKm;
          paceGuidance = "Easy and steady — 30–60 sec slower than target race pace";
          elev = elevationPref;
        } else {
          const remainingDays = runDays - planForm.preferredDays.indexOf(dayName) - (planForm.preferredDays.includes(longRunDay) && planForm.preferredDays.indexOf(dayName) < planForm.preferredDays.indexOf(longRunDay) ? 1 : 0);
          
          if (hardSessionsAssigned < hardSessionsAllowed && !lastWasHard) {
            if (phase === 'build' || phase === 'peak') {
               runType = Math.random() > 0.5 ? 'tempo' : 'intervals';
            } else {
               runType = 'hill_repeats';
            }
            intensity = 'high';
            hardSessionsAssigned++;
            lastWasHard = true;
            
            if (runType === 'tempo') {
              paceGuidance = "Comfortably hard — you can speak in short phrases only";
              elev = 'moderate';
            } else if (runType === 'intervals') {
              paceGuidance = "Hard efforts with recovery jogs — e.g. 6×800m at 5K pace";
              elev = 'flat';
            } else {
              paceGuidance = "Find a steep hill — 8–12% grade, run hard up, jog down";
              elev = 'hilly';
            }
            distance = Math.round((remainingKm - longRunKm) / Math.max(1, remainingDays));
          } else {
            if (lastWasHard) {
              runType = 'recovery';
              paceGuidance = "Very easy — slower than easy pace, keep it short";
              distance = Math.round(((remainingKm - longRunKm) / Math.max(1, remainingDays)) * 0.7);
            } else {
              runType = 'easy';
              distance = Math.round((remainingKm - longRunKm) / Math.max(1, remainingDays));
            }
            lastWasHard = false;
          }
        }

        if (distance < 3) distance = 3;
        remainingKm -= distance;

        const bearing = directions[dirIndex % 4];
        dirIndex++;

        days.push({
          date: currentDate.toISOString(),
          dayOfWeek: dayName,
          runType,
          distanceKm: distance,
          intensity,
          paceGuidance,
          elevationPref: elev,
          suggestedBearing: bearing,
          notes: ''
        });
      }

      const actualWeeklyKm = days.reduce((sum, d) => sum + d.distanceKm, 0);

      weeks.push({
        weekNumber: w,
        phase,
        isStepBack,
        weeklyDistanceKm: actualWeeklyKm,
        days
      });
    }

    const plan: TrainingPlan = {
      planName: `${planForm.goalType} — ${totalWeeks} Week Plan`,
      goalType: planForm.goalType,
      totalWeeks,
      weeks,
      summary: {
        totalDistanceKm: weeks.reduce((sum, w) => sum + w.weeklyDistanceKm, 0),
        peakWeekKm: Math.max(...weeks.map(w => w.weeklyDistanceKm)),
        phases
      }
    };

    setTrainingPlan(plan);
    setPlanPanelOpen(true);
    setExpandedWeek(1);
  };

  const getAiCoachingTips = async (weekNumber: number) => {
    if (!trainingPlan) return;
    
    setAiAdvice(null);
    setIsAiLoading(true);
    try {
      const week = trainingPlan.weeks.find(w => w.weekNumber === weekNumber);
      if (!week) return;

      const weekSummary = week.days.filter(d => d.runType !== 'rest').map(d => `${d.dayOfWeek}: ${d.distanceKm}km ${d.runType}`).join(', ');

      const prompt = `I'm starting a ${trainingPlan.goalType} training plan. I'm at ${planForm.fitnessLevel} level, running ${planForm.daysPerWeek} days per week. My plan is ${trainingPlan.totalWeeks} weeks long. This week (week ${weekNumber}, ${week.phase} phase), my runs are: ${weekSummary}. Give me 3 short coaching tips for this week — what to focus on, common mistakes to avoid, and a motivational note. Keep it concise.`;
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      
      setAiAdvice({ text: response.text || "No advice generated.", places: [] });
    } catch (err) {
      console.error("Failed to get AI advice", err);
      setAiAdvice({ text: "Failed to get AI advice. Please try again.", places: [] });
    } finally {
      setIsAiLoading(false);
    }
  };

  const getAiAdvice = async (type: 'scenic' | 'safety') => {
    if (!startLocation) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = type === 'scenic' 
        ? "What are 3 good scenic parks, trails, or running paths nearby? Please list them clearly."
        : "What are some areas nearby that might have safety concerns for pedestrians or runners at night? Please list them clearly.";

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{googleMaps: {}}],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: startLocation.lat,
                longitude: startLocation.lng
              }
            }
          }
        },
      });

      const text = response.text;
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      
      const places = chunks
        .filter((c: any) => c.maps && c.maps.title)
        .map((c: any) => ({
          title: c.maps.title,
          uri: c.maps.uri,
        }));

      setAiAdvice({ text: text || '', places });
    } catch (err) {
      console.error("Failed to get AI advice", err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStartLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setIsLocating(false);
      },
      (error) => {
        console.error("Error getting location", error);
        setIsLocating(false);
      }
    );
  };

  // Fetch weather when location changes
  useEffect(() => {
    fetch('/api/v1/weather').then(res => res.json()).then(setWeather).catch(console.error);
    
    if (!startLocation) {
      getCurrentLocation();
    }
  }, [startLocation]);

  const generateRoute = async (overrideParams?: { distance: number, elevationPref: string, direction: string }) => {
    setLoading(true);
    try {
      const lat = startLocation ? startLocation.lat : 37.8719;
      const lng = startLocation ? startLocation.lng : -122.2585;
      const d = overrideParams ? overrideParams.distance : distance;
      const e = overrideParams ? overrideParams.elevationPref : elevationPref;
      const dir = overrideParams ? overrideParams.direction : direction;
      const res = await fetch(`/api/v1/route?elevation_pref=${e}&distance=${d}&unit=${unit}&direction=${dir}&startLat=${lat}&startLng=${lng}`);
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        setRoute(data.features[0]);
      }
    } catch (err) {
      console.error("Failed to generate route", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setStartLocation({ lat, lng });
      } else {
        alert("Location not found");
      }
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Prepare chart data
  const elevationMultiplier = unit === 'mi' ? 3.28084 : 1;
  const elevationUnit = unit === 'mi' ? 'ft' : 'm';

  let cumulativeDistance = 0;
  const chartData = route?.geometry.coordinates.map((coord, index, arr) => {
    if (index > 0) {
      const prev = arr[index - 1];
      cumulativeDistance += calculateDistance(prev[1], prev[0], coord[1], coord[0]);
    }
    return {
      distance: Number((unit === 'km' ? cumulativeDistance / 1000 : cumulativeDistance / 1609.34).toFixed(2)),
      elevation: Math.round(coord[2] * elevationMultiplier)
    };
  }) || [];

  const formatDistance = (meters: number) => {
    if (unit === 'km') return (meters / 1000).toFixed(2) + ' km';
    return (meters / 1609.34).toFixed(2) + ' mi';
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      
      {/* SIDEBAR CONTROLS */}
      <div className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full z-10 shadow-xl overflow-y-auto">
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <Activity className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">RouteGen</h1>
          </div>
          <p className="text-sm text-zinc-400 mb-4">Elevation-aware running loops</p>
          
          {/* Mode Toggle */}
          <div className="flex bg-zinc-800 rounded-md p-0.5">
            <button
              onClick={() => setMode('single')}
              className={cn(
                "flex-1 py-1.5 text-sm font-medium rounded-sm transition-colors flex items-center justify-center gap-2",
                mode === 'single' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              🏃 Single Run
            </button>
            <button
              onClick={() => setMode('plan')}
              className={cn(
                "flex-1 py-1.5 text-sm font-medium rounded-sm transition-colors flex items-center justify-center gap-2",
                mode === 'plan' ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              📋 Training Plan
            </button>
          </div>
        </div>

        {mode === 'single' ? (
          <>
            <div className="p-6 flex-1 space-y-8">
              {/* Location Search */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Start Location
                </label>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search city, street..."
                    className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="bg-zinc-800 border border-zinc-700/50 text-zinc-300 p-2 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    title="Search Location"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={isLocating}
                    className="bg-zinc-800 border border-zinc-700/50 text-zinc-300 p-2 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    title="Use Current Location"
                  >
                    <LocateFixed className={cn("w-4 h-4", isLocating && "animate-pulse text-emerald-400")} />
                  </button>
                </form>
                <p className="text-xs text-zinc-500 italic">Or click anywhere on the map to set start point</p>
              </div>

              {/* Distance */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Navigation className="w-4 h-4" /> Distance
                  </label>
                  <div className="flex bg-zinc-800 rounded-md p-0.5">
                    <button 
                      onClick={() => setUnit('km')}
                      className={cn("px-2 py-1 text-xs rounded-sm transition-colors", unit === 'km' ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")}
                    >
                      km
                    </button>
                    <button 
                      onClick={() => setUnit('mi')}
                      className={cn("px-2 py-1 text-xs rounded-sm transition-colors", unit === 'mi' ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")}
                    >
                      mi
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="1" max="30" step="0.5"
                    value={distance}
                    onChange={(e) => setDistance(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="text-lg font-mono w-16 text-right">{distance} {unit}</span>
                </div>
              </div>

              {/* Elevation Preference */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Mountain className="w-4 h-4" /> Elevation Profile
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['flat', 'moderate', 'hilly'] as const).map((pref) => (
                    <button
                      key={pref}
                      onClick={() => setElevationPref(pref)}
                      className={cn(
                        "py-2 px-1 text-xs font-medium rounded-md border transition-all capitalize",
                        elevationPref === pref 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      )}
                    >
                      {pref}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direction Preference */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Compass className="w-4 h-4" /> Direction
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {(['any', 'north', 'south', 'east', 'west'] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => setDirection(dir)}
                      className={cn(
                        "py-2 px-1 text-xs font-medium rounded-md border transition-all capitalize",
                        direction === dir 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      )}
                    >
                      {dir === 'any' ? '*' : dir.charAt(0).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex flex-col gap-3">
              <button 
                onClick={generateRoute}
                disabled={loading}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <MapIcon className="w-5 h-5" /> Generate Route
                  </>
                )}
              </button>
              
              {route && (
                <button 
                  onClick={() => setRoute(null)}
                  className="w-full py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-medium transition-all border border-zinc-700/50 flex items-center justify-center gap-2 text-sm"
                >
                  Clear Route
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Goal Type */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Goal Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['5K', '10K', 'Half Marathon', 'Marathon', 'General Fitness'].map((goal) => (
                    <button
                      key={goal}
                      onClick={() => setPlanForm({ ...planForm, goalType: goal })}
                      className={cn(
                        "py-2 px-1 text-xs font-medium rounded-md border transition-all",
                        planForm.goalType === goal 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                        goal === 'General Fitness' ? "col-span-2" : ""
                      )}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Date */}
              {planForm.goalType !== 'General Fitness' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Target Date
                  </label>
                  <input 
                    type="date" 
                    value={planForm.targetDate}
                    onChange={(e) => setPlanForm({ ...planForm, targetDate: e.target.value })}
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>
              )}

              {/* Fitness Level */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Current Fitness
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                    <button
                      key={level}
                      onClick={() => setPlanForm({ ...planForm, fitnessLevel: level })}
                      className={cn(
                        "py-2 px-1 text-xs font-medium rounded-md border transition-all",
                        planForm.fitnessLevel === level 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Days Per Week */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center justify-between">
                  <span className="flex items-center gap-2"><Calendar className="w-4 h-4" /> Days Per Week</span>
                  <span className="text-emerald-400 font-mono">{planForm.daysPerWeek} days</span>
                </label>
                <input 
                  type="range" 
                  min="3" max="6" step="1"
                  value={planForm.daysPerWeek}
                  onChange={(e) => {
                    const days = parseInt(e.target.value);
                    let newPref = [...planForm.preferredDays];
                    if (newPref.length > days) {
                      newPref = newPref.slice(0, days);
                    } else if (newPref.length < days) {
                      const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                      for (const d of allDays) {
                        if (!newPref.includes(d)) {
                          newPref.push(d);
                          if (newPref.length === days) break;
                        }
                      }
                    }
                    setPlanForm({ ...planForm, daysPerWeek: days, preferredDays: newPref });
                  }}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Preferred Run Days */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Preferred Days
                </label>
                <div className="flex justify-between gap-1">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                    const isSelected = planForm.preferredDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => {
                          let newPref = [...planForm.preferredDays];
                          if (isSelected) {
                            if (newPref.length > 1) {
                              newPref = newPref.filter(d => d !== day);
                            }
                          } else {
                            if (newPref.length < planForm.daysPerWeek) {
                              newPref.push(day);
                              const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                              newPref.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                            }
                          }
                          setPlanForm({ ...planForm, preferredDays: newPref, daysPerWeek: Math.max(3, newPref.length) });
                        }}
                        className={cn(
                          "flex-1 py-2 text-xs font-medium rounded-md border transition-all",
                          isSelected 
                            ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                            : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        )}
                      >
                        {day.charAt(0).toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start Location (Reuse) */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Start Location
                </label>
                <form onSubmit={handleSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search city, street..."
                    className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="bg-zinc-800 border border-zinc-700/50 text-zinc-300 p-2 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    title="Search Location"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={isLocating}
                    className="bg-zinc-800 border border-zinc-700/50 text-zinc-300 p-2 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    title="Use Current Location"
                  >
                    <LocateFixed className={cn("w-4 h-4", isLocating && "animate-pulse text-emerald-400")} />
                  </button>
                </form>
                <p className="text-xs text-zinc-500 italic">Or click anywhere on the map to set start point</p>
              </div>

              {/* Elevation Preference (Reuse) */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Mountain className="w-4 h-4" /> Long Run Elevation
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['flat', 'moderate', 'hilly'] as const).map((pref) => (
                    <button
                      key={pref}
                      onClick={() => setElevationPref(pref)}
                      className={cn(
                        "py-2 px-1 text-xs font-medium rounded-md border transition-all capitalize",
                        elevationPref === pref 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                          : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      )}
                    >
                      {pref}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex flex-col gap-3">
              <button 
                onClick={generateTrainingPlan}
                disabled={!startLocation}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Calendar className="w-5 h-5" /> Generate Plan
              </button>
            </div>
          </>
        )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col relative">
        
        {/* Training Plan Calendar Panel */}
        {planPanelOpen && trainingPlan && (
          <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 shadow-2xl transition-all duration-300 max-h-[60vh] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  {trainingPlan.planName}
                </h3>
                <p className="text-sm text-zinc-400">
                  {trainingPlan.totalWeeks} weeks · {trainingPlan.summary.totalDistanceKm} km total · Peak: {trainingPlan.summary.peakWeekKm} km/wk
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => getAiCoachingTips(expandedWeek)}
                  disabled={isAiLoading}
                  className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-zinc-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                  title="Get AI Coaching Tips for this week"
                >
                  {isAiLoading ? <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setPlanPanelOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Phase Progress Bar */}
            <div className="h-2 w-full flex shrink-0">
              <div className="bg-emerald-500 h-full" style={{ width: `${(trainingPlan.summary.phases.base / trainingPlan.totalWeeks) * 100}%` }} title="Base Phase" />
              <div className="bg-amber-500 h-full" style={{ width: `${(trainingPlan.summary.phases.build / trainingPlan.totalWeeks) * 100}%` }} title="Build Phase" />
              <div className="bg-orange-500 h-full" style={{ width: `${(trainingPlan.summary.phases.peak / trainingPlan.totalWeeks) * 100}%` }} title="Peak Phase" />
              <div className="bg-sky-500 h-full" style={{ width: `${(trainingPlan.summary.phases.taper / trainingPlan.totalWeeks) * 100}%` }} title="Taper Phase" />
            </div>

            {/* Weeks List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {trainingPlan.weeks.map((week) => (
                <div key={week.weekNumber} className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/50">
                  {/* Week Header */}
                  <button 
                    onClick={() => setExpandedWeek(expandedWeek === week.weekNumber ? 0 : week.weekNumber)}
                    className="w-full p-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white">Week {week.weekNumber}</span>
                      <span className={cn(
                        "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full",
                        week.phase === 'base' ? "bg-emerald-500/20 text-emerald-400" :
                        week.phase === 'build' ? "bg-amber-500/20 text-amber-400" :
                        week.phase === 'peak' ? "bg-orange-500/20 text-orange-400" :
                        "bg-sky-500/20 text-sky-400"
                      )}>
                        {week.phase}
                      </span>
                      {week.isStepBack && (
                        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                          ↓ Recovery
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-zinc-400">{week.weeklyDistanceKm} km</span>
                      <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", expandedWeek === week.weekNumber ? "rotate-180" : "")} />
                    </div>
                  </button>

                  {/* Days */}
                  {expandedWeek === week.weekNumber && (
                    <div className="p-3 border-t border-zinc-800 bg-zinc-900/30 overflow-x-auto">
                      <div className="flex gap-3 min-w-max pb-2">
                        {week.days.map((day, idx) => {
                          const isRest = day.runType === 'rest';
                          const dateObj = new Date(day.date);
                          const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                          
                          return (
                            <div key={idx} className={cn(
                              "w-64 p-3 rounded-lg border flex flex-col gap-2 shrink-0",
                              isRest ? "bg-zinc-900/50 border-zinc-800/50 opacity-70" : "bg-zinc-800 border-zinc-700"
                            )}>
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-zinc-400">{dateStr}</span>
                                {!isRest && <span className="text-sm font-mono font-bold text-white">{day.distanceKm} km</span>}
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {day.runType === 'easy' && <span className="text-emerald-400">🏃</span>}
                                {day.runType === 'long' && <span className="text-blue-400">🏔️</span>}
                                {day.runType === 'tempo' && <span className="text-amber-400">⚡</span>}
                                {day.runType === 'intervals' && <span className="text-orange-400">🔥</span>}
                                {day.runType === 'hill_repeats' && <span className="text-red-400">⛰️</span>}
                                {day.runType === 'recovery' && <span className="text-sky-400">🧘</span>}
                                {isRest && <span className="text-zinc-500">😴</span>}
                                <span className={cn(
                                  "font-medium capitalize",
                                  isRest ? "text-zinc-500" : "text-zinc-200"
                                )}>
                                  {day.runType.replace('_', ' ')}
                                </span>
                              </div>
                              
                              <p className="text-xs text-zinc-400 leading-relaxed flex-1">
                                {day.paceGuidance}
                              </p>
                              
                              {!isRest && (
                                <button
                                  onClick={() => {
                                    setMode('single');
                                    setDistance(day.distanceKm);
                                    setElevationPref(day.elevationPref);
                                    setDirection(day.suggestedBearing);
                                    setPlanPanelOpen(false);
                                    generateRoute({
                                      distance: day.distanceKm,
                                      elevationPref: day.elevationPref,
                                      direction: day.suggestedBearing
                                    });
                                  }}
                                  className="mt-2 w-full py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded transition-colors"
                                >
                                  Run This
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOP BAR (Weather & Stats) */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex justify-between items-start pointer-events-none">
          {/* Weather Widget */}
          {weather && (
            <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 p-3 rounded-xl shadow-2xl pointer-events-auto flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Sun className="w-5 h-5 text-amber-400" />
                <span className="font-medium">{weather.temperature}°{weather.unit}</span>
              </div>
              <div className="w-px h-4 bg-zinc-700" />
              <div className="flex items-center gap-2 text-zinc-400">
                <Wind className="w-4 h-4" />
                <span className="text-sm">{weather.wind_speed} mph {weather.wind_direction}</span>
              </div>
              <div className="w-px h-4 bg-zinc-700" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">AQI</span>
                <span className={cn("text-sm font-bold", weather.aqi < 50 ? "text-emerald-400" : "text-amber-400")}>{weather.aqi}</span>
              </div>
            </div>
          )}

          {/* Route Stats Widget */}
          {route && (
            <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-800 p-4 rounded-xl shadow-2xl pointer-events-auto flex gap-6">
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Distance</div>
                <div className="text-xl font-bold font-mono text-zinc-100">{formatDistance(route.properties.distance)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Est. Time</div>
                <div className="text-xl font-bold font-mono text-zinc-100">{Math.round(route.properties.time / 60000)} min</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Elevation</div>
                <div className="text-xl font-bold font-mono text-emerald-400">+{Math.round(route.properties.ascend * elevationMultiplier)}{elevationUnit}</div>
              </div>
            </div>
          )}
        </div>

        {/* AI Advice Panel */}
        {aiAdvice && (
          <div className="absolute top-4 right-4 z-[1000] w-80 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 p-4 rounded-xl shadow-2xl pointer-events-auto flex flex-col gap-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" /> AI Coaching Tips
              </h3>
              <button 
                onClick={() => setAiAdvice(null)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap">
              {aiAdvice.text}
            </div>
            {aiAdvice.places && aiAdvice.places.length > 0 && (
              <div className="mt-2 space-y-2">
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Places Mentioned</h4>
                {aiAdvice.places.map((p, i) => (
                  <a 
                    key={i} 
                    href={p.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg border border-zinc-700/50 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {p.title}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MAP */}
        <div className="flex-1 relative z-0 bg-zinc-950">
          <MapContainer 
            center={startLocation ? [startLocation.lat, startLocation.lng] : [37.8719, -122.2585]} 
            zoom={14} 
            className="w-full h-full"
            zoomControl={false}
          >
            {/* Dark mode map tiles (CartoDB Dark Matter) */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            
            <MapEvents setStartLocation={setStartLocation} />
            {startLocation && <MapCenter center={[startLocation.lat, startLocation.lng]} />}
            
            {startLocation && (
              <Marker position={[startLocation.lat, startLocation.lng]}>
                <Popup>Starting Point</Popup>
              </Marker>
            )}

            {/* Elevation-colored route segments */}
            {route && (() => {
              let cumulativeDist = 0;
              return route.geometry.coordinates.map((coord, i, arr) => {
                if (i === 0) return null;
                const prev = arr[i - 1];
                const dist = calculateDistance(prev[1], prev[0], coord[1], coord[0]);
                cumulativeDist += dist;
                
                // Calculate slope over a larger window (e.g., 50 meters back) to avoid micro-fluctuations
                let windowDist = 0;
                let windowPrev = coord;
                for (let j = i - 1; j >= 0; j--) {
                  const d = calculateDistance(arr[j+1][1], arr[j+1][0], arr[j][1], arr[j][0]);
                  windowDist += d;
                  windowPrev = arr[j];
                  if (windowDist >= 50) break;
                }
                const slope = windowDist > 0 ? (coord[2] - windowPrev[2]) / windowDist : 0;
                
                let color = '#10b981'; // flat
                if (slope > 0.06) color = '#ef4444'; // steep uphill
                else if (slope > 0.02) color = '#f59e0b'; // uphill
                else if (slope < -0.06) color = '#6366f1'; // steep downhill
                else if (slope < -0.02) color = '#0ea5e9'; // downhill

                return (
                  <Polyline 
                    key={`route-segment-${i}`}
                    positions={[[prev[1], prev[0]], [coord[1], coord[0]]]} 
                    color={color} 
                    weight={5} 
                    opacity={0.9}
                  >
                    <LeafletTooltip sticky className="bg-zinc-900 border-zinc-800 text-zinc-100 shadow-xl rounded-lg">
                      <div className="text-xs font-medium space-y-1">
                        <div className="text-zinc-400">Point {i}</div>
                        <div>Distance: {unit === 'km' ? `${(cumulativeDist / 1000).toFixed(2)} km` : `${(cumulativeDist / 1609.34).toFixed(2)} mi`}</div>
                        <div>Elevation: {Math.round(coord[2] * elevationMultiplier)}{elevationUnit}</div>
                        <div>Slope: {(slope * 100).toFixed(1)}%</div>
                      </div>
                    </LeafletTooltip>
                  </Polyline>
                );
              });
            })()}
            <MapUpdater route={route} />
          </MapContainer>
        </div>

        {/* ELEVATION PROFILE CHART */}
        {route && (
          <div className="h-48 bg-zinc-900 border-t border-zinc-800 p-4 z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Mountain className="w-4 h-4" /> Elevation Profile
              </h3>
              <span className="text-xs text-zinc-500 font-mono">Profile: {route.properties.profile}</span>
            </div>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorElevation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis 
                    dataKey="distance" 
                    tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val}${unit}`}
                    minTickGap={30}
                  />
                  <YAxis 
                    domain={['dataMin - 10', 'dataMax + 10']} 
                    tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(val) => `${val}${elevationUnit}`}
                    width={45}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5', borderRadius: '8px' }}
                    itemStyle={{ color: '#10b981' }}
                    labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                    formatter={(value: number) => [`${value}${elevationUnit}`, 'Elevation']}
                    labelFormatter={(label: any) => `Distance: ${label}${unit}`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="elevation" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorElevation)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
