import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with Vite
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: new URL(markerIcon, import.meta.url).href,
  iconRetinaUrl: new URL(markerIcon2x, import.meta.url).href,
  shadowUrl: new URL(markerShadow, import.meta.url).href,
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

type MapLayerProps = {
  startLocation: { lat: number; lng: number } | null;
  setStartLocation: (loc: { lat: number; lng: number }) => void;
  endLocation: { lat: number; lng: number } | null;
  setEndLocation: (loc: { lat: number; lng: number }) => void;
  mapClickTarget: 'start' | 'end';
  route: any;
};

function MapUpdater({ route }: { route: any }) {
  const map = useMap();
  useEffect(() => {
    if (route && route.geometry.coordinates.length > 0) {
      const bounds = route.geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [route, map]);
  return null;
}

function MapEvents({ onClick }: { onClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng);
    },
  });
  return null;
}

export const MapLayer: React.FC<MapLayerProps> = ({
  startLocation, setStartLocation, endLocation, setEndLocation, mapClickTarget, route
}) => {
  const handleMapClick = (latlng: L.LatLng) => {
    if (mapClickTarget === 'start') {
      setStartLocation({ lat: latlng.lat, lng: latlng.lng });
    } else {
      setEndLocation({ lat: latlng.lat, lng: latlng.lng });
    }
  };

  const center: [number, number] = startLocation ? [startLocation.lat, startLocation.lng] : [37.8719, -122.2585];

  return (
    <div className="flex-1 relative z-0">
      <MapContainer center={center} zoom={13} className="h-full w-full">
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        <MapEvents onClick={handleMapClick} />
        <MapUpdater route={route} />
        
        {startLocation && (
          <Marker position={[startLocation.lat, startLocation.lng]}>
            <Popup>Start Location</Popup>
          </Marker>
        )}
        
        {endLocation && (
          <Marker position={[endLocation.lat, endLocation.lng]} icon={redIcon}>
            <Popup>End Location</Popup>
          </Marker>
        )}
        
        {route && (
          <Polyline
            positions={route.geometry.coordinates.map((c: any) => [c[1], c[0]])}
            pathOptions={{ color: '#10b981', weight: 5, opacity: 0.8 }}
          />
        )}
      </MapContainer>
    </div>
  );
};
