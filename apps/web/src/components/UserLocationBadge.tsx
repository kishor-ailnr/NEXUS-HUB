import React, { useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  MapPin,
  MapPinOff,
  Loader2,
  AlertTriangle,
  Compass,
  Navigation,
} from 'lucide-react';
import { useUserLocationStore } from '../store/userLocationStore';

interface UserLocationBadgeProps {
  className?: string;
  fallbackLatitude?: number | null;
  fallbackLongitude?: number | null;
  fallbackOrgName?: string;
}

export const UserLocationBadge: React.FC<UserLocationBadgeProps> = ({
  className = '',
  fallbackLatitude,
  fallbackLongitude,
  fallbackOrgName,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ mode?: string }>();
  const activeMode = params.mode || 'roadways';

  const {
    status,
    coordinates,
    address,
    initLocation,
    triggerFocusMap,
    setPermissionModalOpen,
  } = useUserLocationStore();

  // Initialize browser geolocation on mount
  useEffect(() => {
    initLocation();
  }, [initLocation]);

  // Click handler
  const handleClick = () => {
    if (status === 'detected' || coordinates) {
      // If not currently on a dashboard with map, navigate there
      if (!location.pathname.includes('/dashboard')) {
        navigate(`/${activeMode}/dashboard`);
        setTimeout(() => triggerFocusMap(), 250);
      } else {
        triggerFocusMap();
      }
    } else {
      // Permission denied or unavailable -> open permission guidance modal
      setPermissionModalOpen(true);
    }
  };

  // 1. Initial State / Before Geolocation Fires (preserves backward compatibility with tests)
  if (status === 'idle') {
    return (
      <div
        onClick={handleClick}
        className={`h-9 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-lg flex items-center justify-center gap-1.5 text-center select-none text-[11px] font-semibold text-slate-600 cursor-pointer transition-colors shadow-2xs ${className}`}
        data-testid="location-placeholder"
        title="Detecting your current geographical position..."
      >
        <MapPinOff className="w-3.5 h-3.5 text-slate-400" />
        <span className="leading-tight">Location not yet available</span>
      </div>
    );
  }

  // 2. State A: Location Loading
  if (status === 'detecting') {
    return (
      <div
        onClick={handleClick}
        className={`h-9 px-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-center gap-2 select-none text-[11px] font-medium text-blue-700 cursor-pointer shadow-2xs ${className}`}
        data-testid="location-placeholder"
        title="Requesting device GPS coordinates..."
      >
        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
        <span className="font-semibold">Detecting location...</span>
      </div>
    );
  }

  // 3. State B: Location Detected (Human-readable Address)
  if (status === 'detected' && coordinates) {
    const displayLabel = address?.formatted || `${coordinates.latitude.toFixed(2)}°, ${coordinates.longitude.toFixed(2)}°`;
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`h-9 px-3 bg-white hover:bg-blue-50/60 border border-blue-200/90 rounded-lg flex items-center justify-between gap-2 text-left select-none text-xs text-slate-800 transition-all cursor-pointer shadow-xs group ${className}`}
        data-testid="location-placeholder"
        title={`Your Current Location: ${displayLabel} (${coordinates.latitude.toFixed(4)}°, ${coordinates.longitude.toFixed(4)}°)\nClick to focus your position on the map`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping absolute" />
            <span className="w-2 h-2 rounded-full bg-emerald-500 relative" />
          </div>
          <span className="font-bold text-slate-800 text-[11px] truncate max-w-[150px] group-hover:text-blue-700 transition-colors">
            {displayLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 flex-shrink-0">
          <Navigation className="w-2.5 h-2.5 text-blue-600 fill-blue-600/30" />
          <span>Map</span>
        </div>
      </button>
    );
  }

  // 4. State C: Permission Denied
  if (status === 'permission_denied') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`h-9 px-3 bg-amber-50/80 hover:bg-amber-100/80 border border-amber-200 rounded-lg flex items-center justify-center gap-1.5 text-center select-none text-[11px] font-semibold text-amber-800 cursor-pointer transition-colors shadow-2xs ${className}`}
        data-testid="location-placeholder"
        title="Location permission is denied in your browser. Click to see how to enable it."
      >
        <MapPinOff className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        <span className="truncate max-w-[160px]">Location permission denied</span>
      </button>
    );
  }

  // 5. State D: Location Unavailable / Timeout
  if (status === 'unavailable') {
    // If organization fallback coordinates are provided, show fallback with notice
    if (fallbackLatitude && fallbackLongitude) {
      return (
        <button
          type="button"
          onClick={handleClick}
          className={`h-9 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-lg flex items-center justify-between gap-1.5 text-left select-none text-[11px] text-slate-700 cursor-pointer shadow-2xs ${className}`}
          data-testid="location-placeholder"
          title={`HQ: ${fallbackOrgName || 'Organization'} (${fallbackLatitude.toFixed(2)}, ${fallbackLongitude.toFixed(2)})\nClick to retry device GPS detection.`}
        >
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-700 truncate">{fallbackOrgName || 'HQ Location'}</span>
          </div>
          <span className="text-[9px] font-mono text-slate-400">HQ</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleClick}
        className={`h-9 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-lg flex items-center justify-center gap-1.5 text-center select-none text-[11px] font-semibold text-slate-600 cursor-pointer transition-colors shadow-2xs ${className}`}
        data-testid="location-placeholder"
        title="Device location is unavailable. Click to retry."
      >
        <MapPinOff className="w-3.5 h-3.5 text-slate-400" />
        <span>Location unavailable</span>
      </button>
    );
  }

  // 6. State E: Accuracy Low
  if (status === 'accuracy_low' && coordinates) {
    const displayLabel = address?.formatted || `${coordinates.latitude.toFixed(2)}°, ${coordinates.longitude.toFixed(2)}°`;
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`h-9 px-3 bg-amber-50 hover:bg-amber-100/80 border border-amber-300 rounded-lg flex items-center justify-between gap-1.5 text-left select-none text-[11px] text-amber-900 cursor-pointer transition-colors shadow-2xs ${className}`}
        data-testid="location-placeholder"
        title={`Location Accuracy Low (±${Math.round(coordinates.accuracy)}m). Click to focus or retry.`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span className="font-semibold text-amber-900 truncate">{displayLabel}</span>
        </div>
        <span className="text-[9px] font-mono text-amber-700 bg-amber-100 px-1 py-0.2 rounded border border-amber-300/60">
          ±{Math.round(coordinates.accuracy / 1000)}km
        </span>
      </button>
    );
  }

  // 7. State F: Coordinates Detected – Address Unavailable (Geocoding Failure)
  if (status === 'geocoding_failed' && coordinates) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`h-9 px-3 bg-white hover:bg-blue-50/60 border border-slate-300 rounded-lg flex items-center justify-between gap-1.5 text-left select-none text-[11px] text-slate-800 cursor-pointer transition-colors shadow-2xs ${className}`}
        data-testid="location-placeholder"
        title={`Coordinates detected (${coordinates.latitude.toFixed(3)}°, ${coordinates.longitude.toFixed(3)}°) – Address lookup unavailable.\nClick to view on map.`}
      >
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-700 truncate">
          <Compass className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
          <span>{coordinates.latitude.toFixed(3)}°, {coordinates.longitude.toFixed(3)}°</span>
        </div>
        <span className="text-[9px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
          Map
        </span>
      </button>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`h-9 px-3 bg-slate-50 border border-slate-200/90 rounded-lg flex items-center justify-center gap-1.5 text-[11px] text-slate-600 cursor-pointer ${className}`}
      data-testid="location-placeholder"
    >
      <MapPinOff className="w-3.5 h-3.5 text-slate-400" />
      <span>Location not yet available</span>
    </div>
  );
};

