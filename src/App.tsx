import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { MapLayer } from './components/MapLayer';
import { TrainingPlanView } from './components/TrainingPlanView';
import { RouteDetailView } from './components/RouteDetailView';
import { fetchRoute, fetchWeather, getAiAdvice, getAiCoachingTips, RouteFeature, WeatherData } from './api';
import { calculateDistance, generateTrainingPlan } from './utils';

export default function App() {
  const [mode, setMode] = useState<'single' | 'plan'>('single');
  const [routeType, setRouteType] = useState<'loop' | 'point-to-point'>('loop');
  const [searchQuery, setSearchQuery] = useState('');
  const [endSearchQuery, setEndSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [startLocation, setStartLocation] = useState<{lat: number, lng: number} | null>(null);
  const [endLocation, setEndLocation] = useState<{lat: number, lng: number} | null>(null);
  const [mapClickTarget, setMapClickTarget] = useState<'start' | 'end'>('start');
  const [unit, setUnit] = useState<'km' | 'mi'>('km');
  const [distance, setDistance] = useState(5);
  const [elevationPref, setElevationPref] = useState<'flat' | 'moderate' | 'hilly'>('moderate');
  const [direction, setDirection] = useState('any');
  const [route, setRoute] = useState<RouteFeature | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<any>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [trainingPlan, setTrainingPlan] = useState<any>(null);
  const [planPanelOpen, setPlanPanelOpen] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState(1);
  const [planForm, setPlanForm] = useState({
    goalType: 'Half Marathon',
    targetDate: new Date(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fitnessLevel: 'Intermediate',
    daysPerWeek: 4,
    preferredDays: ['tuesday', 'thursday', 'saturday', 'sunday']
  });

  // Effects
  useEffect(() => {
    fetchWeather().then(setWeather).catch(console.error);
    if (!startLocation) getCurrentLocation();
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStartLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      () => setIsLocating(false)
    );
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setStartLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleEndSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endSearchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endSearchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setEndLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRouteGeneration = async () => {
    setLoading(true);
    try {
      const lat = startLocation?.lat || 37.8719;
      const lng = startLocation?.lng || -122.2585;
      const params: Parameters<typeof fetchRoute>[0] = { distance, unit, elevation_pref: elevationPref, direction, lat, lng };
      if (routeType === 'point-to-point' && endLocation) {
        params.endLat = endLocation.lat;
        params.endLng = endLocation.lng;
      }
      const res = await fetchRoute(params);
      setRoute(res);
    } catch (err) {
      console.error('Route generation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAiAdvice = async (type: 'scenic' | 'safety') => {
    if (!startLocation) return;
    setIsAiLoading(true);
    try {
      const advice = await getAiAdvice(type, startLocation.lat, startLocation.lng);
      setAiAdvice(advice);
    } catch (err) {
      console.error('AI advice failed:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiCoaching = async (weekNumber: number) => {
    if (!trainingPlan) return;
    setIsAiLoading(true);
    try {
      const week = trainingPlan.weeks.find((w: any) => w.weekNumber === weekNumber);
      if (!week) return;
      const weekSummary = week.days.filter((d: any) => d.runType !== 'rest').map((d: any) => `${d.dayOfWeek}: ${d.distanceKm}km ${d.runType}`).join(', ');
      const advice = await getAiCoachingTips({ ...planForm, totalWeeks: trainingPlan.totalWeeks, weekNumber, phase: week.phase, weekSummary });
      setAiAdvice(advice);
    } catch (err) {
      console.error('AI coaching failed:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Chart data
  const elevationMultiplier = unit === 'mi' ? 3.28084 : 1;
  let cumulativeDist = 0;
  const chartData = route?.geometry.coordinates.map((coord: [number, number, number], idx: number, arr: [number, number, number][]) => {
    if (idx > 0) {
      const prev = arr[idx - 1];
      cumulativeDist += calculateDistance(prev[1], prev[0], coord[1], coord[0]);
    }
    return {
      distance: Number((unit === 'km' ? cumulativeDist / 1000 : cumulativeDist / 1609.34).toFixed(2)),
      elevation: Math.round(coord[2] * elevationMultiplier)
    };
  }) || [];

  const handleTrainingPlanGeneration = () => {
    const plan = generateTrainingPlan(planForm, elevationPref);
    setTrainingPlan(plan);
    setPlanPanelOpen(true);
    setExpandedWeek(1);
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      <Sidebar
        mode={mode} setMode={setMode}
        routeType={routeType} setRouteType={setRouteType}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} handleSearch={handleSearch} isSearching={isSearching}
        getCurrentLocation={getCurrentLocation} isLocating={isLocating}
        setMapClickTarget={setMapClickTarget}
        endSearchQuery={endSearchQuery} setEndSearchQuery={setEndSearchQuery} handleEndSearch={handleEndSearch}
        endLocation={endLocation} setEndLocation={setEndLocation}
        unit={unit} setUnit={setUnit}
        distance={distance} setDistance={setDistance}
        elevationPref={elevationPref} setElevationPref={setElevationPref}
        direction={direction} setDirection={setDirection}
        generateRoute={handleRouteGeneration} loading={loading}
        route={route} setRoute={setRoute}
        planForm={planForm} setPlanForm={setPlanForm}
        generateTrainingPlan={handleTrainingPlanGeneration} // Added this prop
      />
      <MapLayer
        startLocation={startLocation} setStartLocation={setStartLocation}
        endLocation={endLocation} setEndLocation={setEndLocation}
        mapClickTarget={mapClickTarget} route={route}
      />
      <RouteDetailView
        route={route} weather={weather} unit={unit} chartData={chartData}
        getAiAdvice={handleAiAdvice} isAiLoading={isAiLoading} aiAdvice={aiAdvice} setAiAdvice={setAiAdvice}
        trainingPlanPanelOpen={planPanelOpen}
      />
      <TrainingPlanView
        trainingPlan={trainingPlan} setTrainingPlan={setTrainingPlan}
        expandedWeek={expandedWeek} setExpandedWeek={setExpandedWeek}
        getAiCoachingTips={handleAiCoaching} isAiLoading={isAiLoading}
        aiAdvice={aiAdvice} setAiAdvice={setAiAdvice}
        planPanelOpen={planPanelOpen} setPlanPanelOpen={setPlanPanelOpen}
      />
    </div>
  );
}
