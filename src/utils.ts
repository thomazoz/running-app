import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { TrainingPlan } from './types';

// Utility for Tailwind classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper to calculate distance between two coordinates in meters
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
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

export const generateTrainingPlan = (planForm: any, elevationPref: 'flat' | 'moderate' | 'hilly'): TrainingPlan => {
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
      let intensity: 'low' | 'high' | 'rest' = 'low';
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

  return {
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
};
