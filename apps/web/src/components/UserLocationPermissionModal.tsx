import React, { useState } from 'react';
import {
  MapPin,
  MapPinOff,
  AlertTriangle,
  RotateCw,
  X,
  ShieldCheck,
  Navigation,
  Compass,
} from 'lucide-react';
import { useUserLocationStore } from '../store/userLocationStore';

export const UserLocationPermissionModal: React.FC = () => {
  const {
    status,
    coordinates,
    address,
    isPermissionModalOpen,
    setPermissionModalOpen,
    requestLocation,
    setManualCoordinates,
  } = useUserLocationStore();

  const [isRetrying, setIsRetrying] = useState(false);

  if (!isPermissionModalOpen) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    await requestLocation(true);
    setIsRetrying(false);
  };

  const PRESET_LOCATIONS = [
    { label: 'Coimbatore, Tamil Nadu', lat: 11.0168, lng: 76.9558 },
    { label: 'Mumbai, Maharashtra', lat: 19.076, lng: 72.8777 },
    { label: 'Bengaluru, Karnataka', lat: 12.9716, lng: 77.5946 },
    { label: 'Chennai, Tamil Nadu', lat: 13.0827, lng: 80.2707 },
    { label: 'New Delhi, Delhi', lat: 28.6139, lng: 77.209 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 text-slate-900">
        {/* Close Button */}
        <button
          onClick={() => setPermissionModalOpen(false)}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shadow-xs">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Current Device Location</h3>
            <p className="text-xs text-slate-500">Live GPS & Reverse Geocoded Mapping</p>
          </div>
        </div>

        {/* Current State Content */}
        {status === 'detected' && coordinates ? (
          <div className="space-y-3.5 mb-5">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>GPS Location Active</span>
              </div>
              <div className="font-bold text-sm text-slate-900 mt-1">
                {address?.formatted || 'Detected Position'}
              </div>
              <div className="text-[11px] text-slate-600 mt-1 font-mono">
                {coordinates.latitude.toFixed(4)}°, {coordinates.longitude.toFixed(4)}° • ±{Math.round(coordinates.accuracy)}m
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Your location is active and displayed on the interactive logistics map. Clicking the top bar location opens and centers the map directly onto your position.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mb-5">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <div className="flex items-center gap-2 font-bold text-amber-800 mb-1">
                {status === 'permission_denied' ? (
                  <MapPinOff className="w-4 h-4 text-amber-700" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                )}
                <span>
                  {status === 'permission_denied'
                    ? 'Location Permission Blocked in Browser'
                    : 'Location Currently Unavailable'}
                </span>
              </div>
              <p className="text-[11px] text-amber-800/90 leading-relaxed mt-1">
                NEXUS WAYS uses your browser's Geolocation API to display your position on the live simulation map. To enable:
              </p>
              <ol className="list-decimal list-inside text-[11px] text-amber-900 font-medium space-y-1 mt-2 pl-1">
                <li>Click the lock or site settings icon in your browser address bar.</li>
                <li>Find <strong>Location</strong> and switch it to <strong>Allow</strong>.</li>
                <li>Click <strong>Retry Detection</strong> below.</li>
              </ol>
            </div>

            {/* Quick Demo Presets if testing in headless or simulated environment */}
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Or Select Location Preset (Testing / Demo):</span>
                <Compass className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="grid grid-cols-1 gap-1.5 max-h-32 overflow-y-auto">
                {PRESET_LOCATIONS.map((loc) => (
                  <button
                    key={loc.label}
                    onClick={async () => {
                      await setManualCoordinates({
                        latitude: loc.lat,
                        longitude: loc.lng,
                        accuracy: 25,
                        timestamp: Date.now(),
                      });
                      setPermissionModalOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-slate-200/80 text-left text-xs font-semibold text-slate-800 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>{loc.label}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {loc.lat}, {loc.lng}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <button
            onClick={() => setPermissionModalOpen(false)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Detecting...' : 'Retry Detection'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

