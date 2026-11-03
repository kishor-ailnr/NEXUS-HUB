import React, { useEffect, useState } from 'react';
import {
  FileText,
  ExternalLink,
  Loader2,
  X,
  Truck,
  User,
  Radio,
  MapPin,
  Clock,
  ShieldCheck,
  Leaf,
  Receipt,
  Navigation,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Trip, TripEtaResponse, DriverBehaviorScore, Vehicle } from '@nexus-ways/shared';
import { tripsApi } from '../services/trips';
import { driversApi } from '../services/drivers';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

interface TripDetailsPanelProps {
  trip?: Trip | null;
  vehicle?: Vehicle | null;
  onClose: () => void;
}

export const TripDetailsPanel: React.FC<TripDetailsPanelProps> = ({ trip, vehicle, onClose }) => {
  const [eta, setEta] = useState<TripEtaResponse | null>(null);
  const [loadingEta, setLoadingEta] = useState<boolean>(false);
  const [driverScores, setDriverScores] = useState<DriverBehaviorScore[]>([]);
  const [loadingScores, setLoadingScores] = useState<boolean>(false);
  const [isOpeningReport, setIsOpeningReport] = useState<boolean>(false);

  const effectiveTripId = trip?.id;
  const effectiveDriverId = trip?.driver_id || vehicle?.assigned_driver_id || vehicle?.driver?.id;

  useEffect(() => {
    if (effectiveTripId) {
      setLoadingEta(true);
      tripsApi
        .getTripEta(effectiveTripId)
        .then((res: TripEtaResponse) => setEta(res))
        .catch((err: any) => console.error('Failed to load ETA:', err))
        .finally(() => setLoadingEta(false));
    } else {
      setEta(null);
    }

    if (effectiveDriverId) {
      setLoadingScores(true);
      driversApi
        .getBehaviorHistory(effectiveDriverId)
        .then((res: DriverBehaviorScore[]) => setDriverScores(res))
        .catch((err: any) => console.error('Failed to load driver behavior history:', err))
        .finally(() => setLoadingScores(false));
    } else {
      setDriverScores([]);
    }
  }, [effectiveTripId, effectiveDriverId]);

  const latestScore = driverScores.length > 0 ? driverScores[0] : null;

  const handleViewReport = async () => {
    if (!effectiveTripId) return;
    setIsOpeningReport(true);
    try {
      const data = await tripsApi.getTripReport(effectiveTripId);
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Could not retrieve report URL.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch trip report.');
    } finally {
      setIsOpeningReport(false);
    }
  };

  const regNumber = vehicle?.registration_number || trip?.vehicle_id || 'Fleet Vehicle';
  const driverName =
    vehicle?.driver?.user?.full_name ||
    vehicle?.driver?.license_number ||
    trip?.driver_id ||
    'Assigned Operator';
  const speedKmh = vehicle?.latest_gps?.speed_kmh ?? 0;
  const status = trip?.status || vehicle?.status || 'active';

  return (
    <aside
      className="fixed inset-y-0 right-0 w-full sm:w-[420px] max-w-full bg-white/98 border-l border-slate-800 shadow-2xl z-50 overflow-y-auto flex flex-col text-slate-800 transition-transform duration-300 ease-out animate-in slide-in-from-right"
      data-testid="fleet-vehicle-details-sidebar"
      aria-label="Fleet Vehicle and Trip Intelligence Sidebar"
    >
      {/* Sticky Top Header with Clearly Visible Close X Button */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-md px-5 py-4 border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">{regNumber}</h2>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                  status === 'in_transit' || status === 'active'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : status === 'completed'
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                {status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-mono">
              {trip?.id ? `Trip: ${trip.id.substring(0, 8)}...` : vehicle?.vehicle_type || 'Commercial Fleet'}
            </p>
          </div>
        </div>

        {/* Top-Right Close (X) Button */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-800/30 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Close vehicle details"
          data-testid="close-vehicle-sidebar-btn"
          title="Close details"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sidebar Content Area */}
      <div className="p-5 space-y-4 flex-1">
        {/* 1. Vehicle & Driver Profile Card */}
        <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-800 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span>Vehicle & Operator</span>
            <span className="text-blue-600 font-mono text-[10px]">Verified Asset</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Type / Class</span>
              <span className="font-semibold text-slate-800">
                {vehicle?.vehicle_type || 'Heavy Logistics Truck'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Capacity</span>
              <span className="font-semibold text-slate-800">
                {vehicle?.capacity_kg ? `${vehicle.capacity_kg.toLocaleString()} kg` : '15,000 kg'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Assigned Driver</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <User className="w-3 h-3 text-slate-400" />
                <span className="truncate">{driverName}</span>
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">Simulated Speed</span>
              <span className="font-semibold text-blue-600 font-mono flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                {speedKmh} km/h
              </span>
            </div>
          </div>

          {vehicle?.convoy_name && (
            <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-xs">
              <span className="text-slate-500">Convoy Formation:</span>
              <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                {vehicle.convoy_name}
              </span>
            </div>
          )}
        </div>

        {/* 2. Route & Active Transit Status */}
        {trip ? (
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-800 shadow-xs">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Operational Route</span>
              <span className="text-emerald-600 font-medium text-[11px] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                OSRM Active
              </span>
            </div>

            <div className="text-xs font-medium text-slate-900 mb-2 leading-relaxed">
              <div className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>From:</strong> {trip.origin_label || 'Origin Depot'}
                </span>
              </div>
              <div className="flex items-start gap-1.5 mt-1.5">
                <Navigation className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>To:</strong> {trip.destination_label || 'Destination Hub'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-200/70 text-xs text-slate-600">
              {trip.distance_km && (
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                  {Number(trip.distance_km).toFixed(1)} km
                </span>
              )}
              {trip.duration_minutes && (
                <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                  ~{Number(trip.duration_minutes).toFixed(0)} mins
                </span>
              )}
            </div>

            {/* View PDF Report button on completed trips */}
            {trip.status === 'completed' && (
              <div className="pt-3 border-t border-slate-200/70 mt-3">
                <button
                  onClick={handleViewReport}
                  disabled={isOpeningReport}
                  data-testid="view-trip-report-btn"
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {isOpeningReport ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating Report...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5" />
                      <span>View PDF Report</span>
                      <ExternalLink className="w-3 h-3 ml-auto opacity-75" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 bg-slate-50/50">
            No active trip currently in-transit for this vehicle.
          </div>
        )}

        {/* 3. ETA & Confidence Interval */}
        {trip && (
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-800 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                ETA & Confidence Band
              </span>
              {eta && (
                <span
                  data-testid="confidence-basis-badge"
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    eta.confidence_basis === 'historical'
                      ? 'bg-teal-50 text-teal-700 border-teal-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {eta.confidence_basis === 'historical'
                    ? `based on ${eta.sample_size} prior trips on this route`
                    : 'default estimate — no route history yet'}
                </span>
              )}
            </div>

            {loadingEta ? (
              <div className="text-xs text-slate-400 py-2 animate-pulse">
                Calculating ETA confidence interval...
              </div>
            ) : eta ? (
              <div className="space-y-2 mt-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-slate-500">Remaining ETA:</span>
                  <span className="text-base font-bold text-slate-900 font-mono">
                    {eta.base_eta_minutes} mins
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Remaining Distance:</span>
                  <span className="text-slate-700 font-mono font-medium">
                    {Number(eta.remaining_distance_km).toFixed(1)} km
                  </span>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs">
                  <div className="flex justify-between text-slate-700 mb-1">
                    <span>Confidence Interval:</span>
                    <span className="font-mono text-emerald-700 font-bold">
                      {eta.min_eta_minutes} – {eta.max_eta_minutes} min
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {eta.confidence_basis === 'historical' ? (
                      <span>StdDev ±{eta.confidence_band_minutes}m from {eta.sample_size} past completions.</span>
                    ) : (
                      <span>Heuristic estimate (±15% band). Sample size: {eta.sample_size}.</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">ETA telemetry unavailable</div>
            )}
          </div>
        )}

        {/* 4. Driver Behavior & Safety Score */}
        <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Driver Safety Score
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Telemetry Rules</span>
          </div>

          {loadingScores ? (
            <div className="text-xs text-slate-400 py-2 animate-pulse">
              Loading telemetry behavior metrics...
            </div>
          ) : latestScore ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-3xl font-black font-mono text-emerald-600">
                  {latestScore.score}
                  <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  <div className="text-amber-600 font-medium">
                    Harsh Brakes: {latestScore.harsh_brake_count}
                  </div>
                  <div className="text-rose-600 font-medium">
                    Speeding Events: {latestScore.speeding_event_count}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 bg-white p-2 rounded-lg border border-slate-200 font-mono">
                Formula: 100 - (10 × brakes) - (5 × speedings)
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200">
              Safety score is computed dynamically upon trip telemetry recording.
            </div>
          )}
        </div>

        {/* 5. Carbon & Toll Intelligence */}
        {trip && (
          <div className="grid grid-cols-2 gap-3">
            {/* Carbon Card */}
            <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-800 shadow-xs">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Carbon (CO₂e)</span>
                <Leaf className="w-3 h-3 text-emerald-500" />
              </div>
              <div className="text-base font-bold font-mono text-slate-900">
                {trip.carbon_kg != null ? `${Number(trip.carbon_kg).toFixed(1)} kg` : 'Calculating'}
              </div>
              <div className="text-[9px] text-slate-400 mt-1">GLEC Framework 2023</div>
            </div>

            {/* Toll Card */}
            <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-800 shadow-xs">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Highway Toll</span>
                <Receipt className="w-3 h-3 text-blue-500" />
              </div>
              <div className="text-base font-bold font-mono text-slate-900">
                {trip.toll_estimate_inr != null ? `₹${Number(trip.toll_estimate_inr).toFixed(0)}` : 'Estimated'}
              </div>
              <div className="text-[9px] text-slate-400 mt-1">NHAI Rate Model</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
