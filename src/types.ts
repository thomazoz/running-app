export type RouteFeature = {
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

export type WeatherData = {
  temperature: number;
  unit: string;
  condition: string;
  precipitation: number;
  wind_speed: number;
  wind_direction: string;
  aqi: number;
  comfort_score: number;
};

export type TrainingPlan = {
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
