import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Navigation, Mountain, Shield, Sun, Wind, Sparkles, LocateFixed, X, MapPin } from 'lucide-react';
import { cn } from '../utils';

type RouteDetailViewProps = {
  route: any;
  weather: any;
  unit: 'km' | 'mi';
  chartData: any[];
  getAiAdvice: (type: 'scenic' | 'safety') => void;
  isAiLoading: boolean;
  aiAdvice: any;
  setAiAdvice: (advice: any) => void;
  trainingPlanPanelOpen: boolean;
};

export const RouteDetailView: React.FC<RouteDetailViewProps> = ({
  route, weather, unit, chartData, getAiAdvice, isAiLoading, aiAdvice, setAiAdvice, trainingPlanPanelOpen
}) => {
  if (!route) return null;

  const elevationUnit = unit === 'mi' ? 'ft' : 'm';
  const elevationMultiplier = unit === 'mi' ? 3.28084 : 1;
  const formatDistance = (meters: number) => {
    if (unit === 'km') return (meters / 1000).toFixed(2) + ' km';
    return (meters / 1609.34).toFixed(2) + ' mi';
  };
  const formatElevation = (meters: number) => Math.round(meters * elevationMultiplier);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[900px] max-w-[95%] bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl p-6 z-10 animate-in slide-in-from-bottom-8 duration-500">
      <div className="grid grid-cols-12 gap-8">
        
        {/* STATS AREA */}
        <div className="col-span-4 space-y-6">
          <div className="flex gap-4">
            <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70 mb-1">Distance</p>
              <p className="text-2xl font-mono font-bold text-emerald-400">{formatDistance(route.properties.distance)}</p>
            </div>
            <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Elevation Gain</p>
              <p className="text-2xl font-mono font-bold text-zinc-100">{formatElevation(route.properties.ascend)} {elevationUnit}</p>
            </div>
          </div>

          <div className="space-y-3">
             <button
               onClick={() => getAiAdvice('scenic')}
               disabled={isAiLoading}
               className="w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
             >
               <Sparkles className="w-3.5 h-3.5" /> High-Scenic Hotspots
             </button>
             <button
               onClick={() => getAiAdvice('safety')}
               disabled={isAiLoading}
               className="w-full py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
             >
               <Shield className="w-3.5 h-3.5" /> Run Safety Audit
             </button>
          </div>

          {weather && (
            <div className="flex items-center gap-4 bg-zinc-950/40 p-3 rounded-xl border border-zinc-800/50">
              <div className="bg-amber-500/10 p-2 rounded-lg">
                <Sun className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-zinc-400 font-medium">{weather.condition} • {weather.temperature}°{weather.unit}</p>
                <div className="flex gap-2">
                  <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono uppercase"><Wind className="w-3 h-3" /> {weather.wind_speed} mph</span>
                  <span className="text-[10px] text-zinc-500 flex items-center gap-1 font-mono uppercase"><LocateFixed className="w-3 h-3" /> AQI {weather.aqi}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-zinc-600">Comfort</p>
                <p className="text-sm font-mono font-bold text-emerald-500">{weather.comfort_score}%</p>
              </div>
            </div>
          )}
        </div>

        {/* CHART AREA */}
        <div className="col-span-8 flex flex-col pt-1">
          <div className="flex justify-between items-end mb-4 pr-2">
            <div>
              <h3 className="font-bold text-zinc-100 flex items-center gap-2"><Mountain className="w-4 h-4 text-zinc-500" /> Elevation Profile</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Verticality analysis for segment selection</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase font-bold">Elevation Drop</p>
              <p className="text-sm font-mono font-bold text-zinc-300">{formatElevation(route.properties.descend)} {elevationUnit}</p>
            </div>
          </div>
          
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis 
                  dataKey="distance" 
                  stroke="#52525b" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `${val} ${unit}`}
                />
                <YAxis 
                   hide
                   domain={['auto', 'auto']}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', fontSize: '11px' }}
                  itemStyle={{ color: '#10b981' }}
                  labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="elevation" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorElev)" 
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI DRAWER (Nested inside) */}
      {aiAdvice && !trainingPlanPanelOpen && (
        <div className="mt-6 pt-6 border-t border-zinc-800 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-bold text-emerald-400 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Local Intelligence</h4>
            <button onClick={() => setAiAdvice(null)} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <p className="text-xs text-zinc-300 leading-relaxed">{aiAdvice.text}</p>
            <div className="flex flex-wrap gap-2 content-start">
              {aiAdvice.places.map((place: any, i: number) => (
                <a 
                  key={i} 
                  href={place.uri} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 rounded-lg flex items-center gap-2 transition-all"
                >
                  <MapPin className="w-3 h-3 text-emerald-500" /> {place.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

