import React, { useEffect, useRef } from 'react';
import { MapPin, MapPinOff } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MiniMapProps {
  latitude?: number | null;
  longitude?: number | null;
  orgName?: string;
  className?: string;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  latitude,
  longitude,
  orgName = 'Organization HQ',
  className = '',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const hasCoordinates =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) &&
    !isNaN(longitude);

  useEffect(() => {
    if (!hasCoordinates || !mapContainerRef.current) {
      return;
    }

    try {
      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [latitude!, longitude!],
          zoom: 12,
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
        }).addTo(map);

        const customIcon = L.divIcon({
          className: 'custom-pin',
          html: `<div style="background-color: #2563eb; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 8px rgba(37,99,235,0.7);"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        L.marker([latitude!, longitude!], { icon: customIcon })
          .addTo(map)
          .bindPopup(orgName);

        mapInstanceRef.current = map;
        setTimeout(() => map.invalidateSize(), 100);
      } else {
        mapInstanceRef.current.setView([latitude!, longitude!], 12);
        mapInstanceRef.current.invalidateSize();
      }
    } catch {
      // Graceful fallback in environments without full DOM canvas
    }

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, hasCoordinates, orgName]);

  if (!hasCoordinates) {
    return (
      <div
        className={`h-9 px-2.5 bg-slate-50 border border-slate-800 rounded-lg flex items-center justify-center gap-1.5 text-center select-none text-[10px] text-slate-600 ${className}`}
        data-testid="location-placeholder"
      >
        <MapPinOff className="w-3.5 h-3.5 text-slate-400" />
        <span className="font-semibold text-slate-600 leading-tight">Location not yet available</span>
      </div>
    );
  }

  return (
    <div
      className={`h-9 w-32 xl:w-36 rounded-lg overflow-hidden border border-slate-800 shadow-xs relative z-0 bg-slate-100 flex-shrink-0 ${className}`}
      data-testid="mini-map"
      title={`HQ Location: ${latitude?.toFixed(3)}, ${longitude?.toFixed(3)}`}
    >
      <div ref={mapContainerRef} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
      <div className="absolute bottom-0.5 right-1 z-[400] bg-white/90 backdrop-blur-xs px-1 py-0.2 rounded border border-slate-800 text-[9px] text-slate-700 flex items-center gap-0.5 font-mono shadow-xs">
        <MapPin className="w-2.5 h-2.5 text-blue-600" />
        <span>
          {latitude?.toFixed(1)},{longitude?.toFixed(1)}
        </span>
      </div>
    </div>
  );
};
