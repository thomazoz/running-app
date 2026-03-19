import React from 'react';
import { Calendar, ChevronDown, Sparkles, X } from 'lucide-react';
import { cn } from '../utils';

type TrainingPlanViewProps = {
  trainingPlan: any;
  setTrainingPlan: (plan: any) => void;
  expandedWeek: number;
  setExpandedWeek: (week: number) => void;
  getAiCoachingTips: (week: number) => void;
  isAiLoading: boolean;
  aiAdvice: any;
  setAiAdvice: (advice: any) => void;
  planPanelOpen: boolean;
  setPlanPanelOpen: (open: boolean) => void;
};

export const TrainingPlanView: React.FC<TrainingPlanViewProps> = ({
  trainingPlan, setTrainingPlan, expandedWeek, setExpandedWeek, getAiCoachingTips,
  isAiLoading, aiAdvice, setAiAdvice, planPanelOpen, setPlanPanelOpen
}) => {
  if (!trainingPlan || !planPanelOpen) return null;

  return (
    <div className="absolute left-4 top-4 right-4 bottom-4 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-20 flex flex-col overflow-hidden">
      <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold text-white">{trainingPlan.planName}</h2>
          <p className="text-zinc-400 text-sm mt-1">
            {trainingPlan.totalWeeks} weeks • {trainingPlan.summary.totalDistanceKm}km total • Peak: {trainingPlan.summary.peakWeekKm}km/wk
          </p>
        </div>
        <button onClick={() => setPlanPanelOpen(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
          <X className="w-6 h-6 text-zinc-400" />
        </button>
      </div>

      <div className="flex-1 overflow-x-auto p-6 bg-zinc-950/50">
        <div className="flex gap-4 pb-4">
          {trainingPlan.weeks.map((week: any) => (
            <div
              key={week.weekNumber}
              className={cn(
                "min-w-[280px] rounded-xl border transition-all flex flex-col",
                expandedWeek === week.weekNumber ? "bg-zinc-800/50 border-emerald-500/50 ring-1 ring-emerald-500/20" : "bg-zinc-900/30 border-zinc-800 hover:border-zinc-700"
              )}
            >
              <div className="p-4 border-b border-zinc-800/50 flex justify-between items-center cursor-pointer" onClick={() => setExpandedWeek(week.weekNumber)}>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Week {week.weekNumber}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h3 className="font-bold text-zinc-100 capitalize">{week.phase}</h3>
                    {week.isStepBack && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded uppercase font-bold tracking-tighter">Step-back</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono font-bold text-emerald-400">{week.weeklyDistanceKm}km</div>
                  <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform", expandedWeek === week.weekNumber && "rotate-180")} />
                </div>
              </div>

              {expandedWeek === week.weekNumber && (
                <div className="p-3 space-y-2 flex-1">
                  {week.days.map((day: any, idx: number) => (
                    <div key={idx} className={cn("p-2 rounded-lg border", day.runType === 'rest' ? "bg-zinc-950/20 border-transparent opacity-40" : "bg-zinc-900 border-zinc-800/50")}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-500">{day.dayOfWeek.slice(0, 3)}</span>
                        {day.distanceKm > 0 && <span className="text-xs font-mono font-bold text-zinc-300">{day.distanceKm}km</span>}
                      </div>
                      <div className="text-xs font-medium text-zinc-100 flex items-center gap-1.5 capitalize">
                        <div className={cn("w-1.5 h-1.5 rounded-full", day.intensity === 'high' ? "bg-red-400" : day.runType === 'rest' ? "bg-zinc-600" : "bg-emerald-400")}></div>
                        {day.runType.replace('_', ' ')}
                      </div>
                    </div>
                  ))}
                  
                  <button
                    onClick={(e) => { e.stopPropagation(); getAiCoachingTips(week.weekNumber); }}
                    disabled={isAiLoading}
                    className="w-full py-2 mt-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-bold rounded-lg flex items-center justify-center gap-2 border border-emerald-500/10"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isAiLoading ? "Consulting Coach..." : "Get AI Coaching"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {aiAdvice && expandedWeek && (
        <div className="p-6 border-t border-zinc-800 bg-zinc-900 shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h4 className="font-bold text-zinc-100">Coach's Perspective: Week {expandedWeek}</h4>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{aiAdvice.text}</p>
        </div>
      )}
    </div>
  );
};
