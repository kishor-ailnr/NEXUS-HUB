import React, { useState } from 'react';
import {
  MapPin,
  Truck,
  Clock,
  Compass,
  Layers,
  ChevronRight,
  Shield,
  Fuel,
  Coffee,
} from 'lucide-react';
import {
  MockCheckpoint,
  MockRoute,
  MockVehicle,
  MockReroute,
  CHECKPOINT_TYPE_LABELS,
} from '@nexus-ways/shared';

interface FleetMapViewProps {
  vehicle: MockVehicle;
  route: MockRoute;
  checkpoints: MockCheckpoint[];
  activeReroute?: MockReroute | null;
}

export const FleetMapView: React.FC<FleetMapViewProps> = ({
  vehicle,
  route,
  checkpoints,
  activeReroute,
}) => {
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<MockCheckpoint | null>(null);

  const totalDist = route.total_distance_km || 800;
  const currentDist = (vehicle.progress_pct / 100) * totalDist;

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-5 shadow-sm text-slate-900 flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-blue-600" />
          <div>
            <h4 className="text-sm font-bold text-slate-900">Corridor Telemetry & Checkpoints</h4>
            <p className="text-xs text-slate-500">{route.corridor || route.name}</p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
          {vehicle.progress_pct.toFixed(1)}% Completed
        </span>
      </div>

      {/* Corridor Visual Progress Line */}
      <div className="relative my-4 px-3">
        {/* Track Line */}
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 relative">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, vehicle.progress_pct))}%` }}
          />
        </div>

        {/* Vehicle Marker Pin */}
        <div
          className="absolute -top-3.5 transform -translate-x-1/2 flex flex-col items-center z-10 transition-all duration-500"
          style={{ left: `${Math.min(96, Math.max(4, vehicle.progress_pct))}%` }}
        >
          <div className="p-1 rounded-full bg-blue-600 text-white shadow-md shadow-blue-500/30 animate-bounce">
            <Truck className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-mono font-bold text-blue-700 mt-1 bg-white px-1.5 py-0.2 rounded border border-blue-200 shadow-xs">
            {vehicle.speed_kmh} km/h
          </span>
        </div>
      </div>

      {/* Checkpoint Sequence List */}
      <div className="mt-3 flex-1 overflow-y-auto max-h-[260px] pr-1 space-y-2 scrollbar-thin scrollbar-thumb-slate-200">
        {checkpoints.map((cp, idx) => {
          const isPassed = cp.distance_from_start_km <= currentDist;
          const isCurrent =
            Math.abs(cp.distance_from_start_km - currentDist) <= 25 ||
            (isPassed && (idx === checkpoints.length - 1 || checkpoints[idx + 1].distance_from_start_km > currentDist));
          const isSelected = selectedCheckpoint?.id === cp.id;

          return (
            <div
              key={cp.id}
              onClick={() => setSelectedCheckpoint(cp)}
              className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                isCurrent
                  ? 'bg-blue-50/90 border-blue-300 shadow-xs'
                  : isSelected
                  ? 'bg-indigo-50 border-indigo-300'
                  : 'bg-slate-50/80 border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold ${
                    isPassed
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}
                >
                  {idx + 1}
                </div>
                <div>
                  <div className="font-semibold text-slate-900 line-clamp-1">{cp.name}</div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {CHECKPOINT_TYPE_LABELS[cp.type] || cp.type} • {cp.distance_from_start_km} km
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono text-[11px] font-semibold text-slate-800">
                  +{cp.planned_arrival_minutes}m
                </div>
                {cp.avg_halt_minutes > 0 && (
                  <div className="text-[10px] font-medium text-amber-700">
                    Halt ~{cp.avg_halt_minutes}m
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Checkpoint Detail Popup / Footer */}
      {selectedCheckpoint && (
        <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-blue-200 text-xs space-y-1 shadow-xs">
          <div className="flex items-center justify-between font-bold text-blue-900">
            <span>{selectedCheckpoint.name}</span>
            <span className="font-mono text-slate-500">{selectedCheckpoint.latitude.toFixed(4)}, {selectedCheckpoint.longitude.toFixed(4)}</span>
          </div>
          <div className="text-slate-600 text-[11px]">
            Distance from corridor start: {selectedCheckpoint.distance_from_start_km} km • Expected halt: {selectedCheckpoint.avg_halt_minutes} minutes
          </div>
        </div>
      )}
    </div>
  );
};

