import React from 'react';
import { Activity, Navigation, MapPin, Search, LocateFixed, Mountain, Compass, Calendar } from 'lucide-react';
import { cn } from '../utils';

type SidebarProps = {
  mode: 'single' | 'plan';
  setMode: (mode: 'single' | 'plan') => void;
  routeType: 'loop' | 'point-to-point';
  setRouteType: (type: 'loop' | 'point-to-point') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  handleSearch: (e: React.FormEvent) => void;
  isSearching: boolean;
  getCurrentLocation: () => void;
  isLocating: boolean;
  setMapClickTarget: (target: 'start' | 'end') => void;
  endSearchQuery: string;
  setEndSearchQuery: (query: string) => void;
  handleEndSearch: (e: React.FormEvent) => void;
  endLocation: { lat: number; lng: number } | null;
  setEndLocation: (loc: { lat: number; lng: number } | null) => void;
  unit: 'km' | 'mi';
  setUnit: (unit: 'km' | 'mi') => void;
  distance: number;
  setDistance: (d: number) => void;
  elevationPref: 'flat' | 'moderate' | 'hilly';
  setElevationPref: (pref: 'flat' | 'moderate' | 'hilly') => void;
  direction: string;
  setDirection: (dir: string) => void;
  generateRoute: () => void;
  loading: boolean;
  route: any;
  setRoute: (route: any) => void;
  planForm: any;
  setPlanForm: (form: any) => void;
  generateTrainingPlan: () => void;
};

export const Sidebar: React.FC<SidebarProps> = ({
  mode, setMode, routeType, setRouteType, searchQuery, setSearchQuery, handleSearch, isSearching,
  getCurrentLocation, isLocating, setMapClickTarget, endSearchQuery, setEndSearchQuery,
  handleEndSearch, endLocation, setEndLocation, unit, setUnit, distance, setDistance,
  elevationPref, setElevationPref, direction, setDirection, generateRoute, loading, route, setRoute,
  planForm, setPlanForm, generateTrainingPlan
}) => {
  return (
    <div className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full z-10 shadow-xl overflow-y-auto">
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-emerald-500/20 p-2 rounded-lg">
            <Activity className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">RouteGen</h1>
        </div>
        <p className="text-sm text-zinc-400 mb-4">Elevation-aware running loops</p>
        
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
            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Navigation className="w-4 h-4" /> Route Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['loop', 'point-to-point'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => { setRouteType(type); setEndLocation(null); setMapClickTarget('start'); }}
                    className={cn(
                      "py-2 px-1 text-xs font-medium rounded-md border transition-all",
                      routeType === type ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400"
                    )}
                  >
                    {type === 'loop' ? 'Loop' : 'Point to Point'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Start Location
              </label>
              <form onSubmit={handleSearch} className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  placeholder="Search city, street..."
                  className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <button type="submit" disabled={isSearching} className="bg-zinc-800 border border-zinc-700/50 text-zinc-300 p-2 rounded-lg">
                  <Search className="w-4 h-4" />
                </button>
                <button type="button" onClick={getCurrentLocation} disabled={isLocating} className="bg-zinc-800 border border-zinc-700/50 text-zinc-300 p-2 rounded-lg">
                  <LocateFixed className={cn("w-4 h-4", isLocating && "animate-pulse text-emerald-400")} />
                </button>
              </form>
            </div>

            {routeType === 'point-to-point' && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-red-400" /> End Location
                </label>
                <form onSubmit={handleEndSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={endSearchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndSearchQuery(e.target.value)}
                    placeholder="Search end location..."
                    className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                  />
                  <button type="submit" disabled={isSearching} className="bg-zinc-800 border border-zinc-700/50 text-zinc-300 p-2 rounded-lg">
                    <Search className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {routeType === 'loop' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                    <Navigation className="w-4 h-4" /> Distance
                  </label>
                  <div className="flex bg-zinc-800 rounded-md p-0.5">
                    <button onClick={() => setUnit('km')} className={cn("px-2 py-1 text-xs rounded-sm", unit === 'km' ? "bg-zinc-700 text-white" : "text-zinc-400")}>km</button>
                    <button onClick={() => setUnit('mi')} className={cn("px-2 py-1 text-xs rounded-sm", unit === 'mi' ? "bg-zinc-700 text-white" : "text-zinc-400")}>mi</button>
                  </div>
                </div>
                <input type="range" min="1" max="30" step="0.5" value={distance} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDistance(parseFloat(e.target.value))} className="w-full accent-emerald-500" />
                <div className="text-right text-lg font-mono">{distance} {unit}</div>
              </div>
            )}

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
                      elevationPref === pref ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400"
                    )}
                  >
                    {pref}
                  </button>
                ))}
              </div>
            </div>

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
                      direction === dir ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400"
                    )}
                  >
                    {dir === 'any' ? '*' : dir.charAt(0).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex flex-col gap-3">
            <button onClick={generateRoute} disabled={loading || (routeType === 'point-to-point' && !endLocation)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Generating..." : "Generate Route"}
            </button>
            {route && <button onClick={() => setRoute(null)} className="w-full py-2 bg-zinc-800 text-zinc-300 rounded-xl text-sm">Clear Route</button>}
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                    planForm.goalType === goal ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400"
                  )}
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Target Date
            </label>
            <input 
              type="date" 
              value={planForm.targetDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPlanForm({ ...planForm, targetDate: e.target.value })}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
          </div>

          <div className="space-y-3">
             <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
               <Activity className="w-4 h-4" /> Fitness Level
             </label>
             <div className="grid grid-cols-3 gap-2">
               {['Beginner', 'Intermediate', 'Advanced'].map((level) => (
                 <button
                   key={level}
                   onClick={() => setPlanForm({ ...planForm, fitnessLevel: level })}
                   className={cn(
                     "py-2 px-1 text-xs font-medium rounded-md border transition-all",
                     planForm.fitnessLevel === level ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400"
                   )}
                 >
                   {level}
                 </button>
               ))}
             </div>
           </div>

           <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 mt-auto">
             <button onClick={generateTrainingPlan} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium">
               Generate Training Plan
             </button>
           </div>
        </div>
      )}
    </div>
  );
};
