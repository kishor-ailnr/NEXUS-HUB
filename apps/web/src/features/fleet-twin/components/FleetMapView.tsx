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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col justify-between h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-cyan-400" />
          <div>
            <h4 className="text-sm font-bold text-white">Corridor Telemetry & Checkpoints</h4>
            <p className="text-xs text-slate-400">{route.corridor || route.name}</p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
          {vehicle.progress_pct.toFixed(1)}% Completed
        </span>
      </div>

      {/* Corridor Visual Progress Line */}
      <div className="relative my-4 px-3">
        {/* Track Line */}
        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, vehicle.progress_pct))}%` }}
          />
        </div>

        {/* Vehicle Marker Pin */}
        <div
          className="absolute -top-3.5 transform -translate-x-1/2 flex flex-col items-center z-10 transition-all duration-500"
          style={{ left: `${Math.min(96, Math.max(4, vehicle.progress_pct))}%` }}
        >
          <div className="p-1 rounded-full bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/50 animate-bounce">
            <Truck className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-mono font-bold text-cyan-300 mt-1 bg-slate-900 px-1 rounded border border-cyan-800">
            {vehicle.speed_kmh} km/h
          </span>
        </div>
      </div>

      {/* Checkpoint Sequence List */}
      <div className="mt-3 flex-1 overflow-y-auto max-h-[260px] pr-1 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
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
                  ? 'bg-cyan-950/30 border-cyan-500/50 shadow-md shadow-cyan-950/20'
                  : isSelected
                  ? 'bg-slate-800 border-indigo-400'
                  : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold ${
                    isPassed
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {idx + 1}
                </div>
                <div>
                  <div className="font-semibold text-slate-200 line-clamp-1">{cp.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {CHECKPOINT_TYPE_LABELS[cp.type] || cp.type} • {cp.distance_from_start_km} km
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono text-[11px] text-slate-300">
                  +{cp.planned_arrival_minutes}m
                </div>
                {cp.avg_halt_minutes > 0 && (
                  <div className="text-[10px] text-amber-400">
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
        <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-cyan-500/30 text-xs space-y-1">
          <div className="flex items-center justify-between font-bold text-cyan-300">
            <span>{selectedCheckpoint.name}</span>
            <span className="font-mono">{selectedCheckpoint.latitude.toFixed(4)}, {selectedCheckpoint.longitude.toFixed(4)}</span>
          </div>
          <div className="text-slate-400 text-[11px]">
            Distance from corridor start: {selectedCheckpoint.distance_from_start_km} km • Expected halt: {selectedCheckpoint.avg_halt_minutes} minutes
          </div>
        </div>
      )}
    </div>
  );
};

