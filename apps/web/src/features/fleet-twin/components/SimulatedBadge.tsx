import React, { useState } from 'react';
import { Sparkles, Clock, Trash2, Database, ShieldAlert, RefreshCw } from 'lucide-react';
import { PurgeMockDataModal } from './PurgeMockDataModal';
import { fleetTwinApi } from '../services/fleetTwinApi';
import { toast } from 'sonner';

interface SimulatedBadgeProps {
  expiresAt?: string;
  onRefresh?: () => void;
  compact?: boolean;
}

export const SimulatedBadge: React.FC<SimulatedBadgeProps> = ({
  expiresAt,
  onRefresh,
  compact = false,
}) => {
  const [isPurgeModalOpen, setIsPurgeModalOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeed = async () => {
    try {
      setIsSeeding(true);
      const res = await fleetTwinApi.seedMockData();
      toast.success(`Seeded ${res.counts.vehicles} simulated vehicles across 4 fleets.`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to seed simulated data.');
    } finally {
      setIsSeeding(false);
    }
  };

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[11px] font-semibold tracking-wide uppercase">
        <Sparkles className="w-3 h-3 text-cyan-400 animate-pulse" />
        <span>SIMULATION</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/10 shadow-lg text-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
            <Sparkles className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide uppercase">
                Fleet Digital Twin Simulation
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
                SIMULATION
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-cyan-400/80" />
              <span>
                Deterministic corridor logistics telemetry • 48-hour future prediction
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            title="Re-seed demo fleet telemetry"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>Reset demo data</span>
          </button>

          <button
            onClick={() => setIsPurgeModalOpen(true)}
            title="Clear demo data"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear demo data</span>
          </button>
        </div>
      </div>

      <PurgeMockDataModal
        isOpen={isPurgeModalOpen}
        onClose={() => setIsPurgeModalOpen(false)}
        onPurged={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </>
  );
};

