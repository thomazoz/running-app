import type { WeatherData, RouteFeature } from './types';
export type { WeatherData, RouteFeature };

export async function fetchRoute(params: {
  distance: number;
  unit: 'km' | 'mi';
  elevation_pref: string;
  direction: string;
  lat: number;
  lng: number;
  endLat?: number;
  endLng?: number;
}): Promise<RouteFeature | null> {
  const { distance, unit, elevation_pref, direction, lat, lng, endLat, endLng } = params;
  let url = `/api/v1/route?elevation_pref=${elevation_pref}&distance=${distance}&unit=${unit}&direction=${direction}&startLat=${lat}&startLng=${lng}`;
  if (endLat !== undefined && endLng !== undefined) {
    url += `&endLat=${endLat}&endLng=${endLng}`;
  }
  const res = await fetch(url);
  const data = await res.json();
  if (data.features && data.features.length > 0) {
    return data.features[0];
  }
  return null;
}

export async function fetchWeather(): Promise<WeatherData> {
  const res = await fetch('/api/v1/weather');
  return res.json();
}

export async function fetchGeocode(query: string): Promise<{ lat: number, lon: number } | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (data && data.length > 0) {
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  }
  return null;
}

export async function getAiAdvice(type: 'scenic' | 'safety', lat: number, lng: number): Promise<{ text: string, places: { title: string, uri: string }[] }> {
  const res = await fetch('/api/v1/ai/advice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, lat, lng }),
  });
  return res.json();
}

export async function getAiCoachingTips(params: any): Promise<{ text: string }> {
  const res = await fetch('/api/v1/ai/coaching', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}
