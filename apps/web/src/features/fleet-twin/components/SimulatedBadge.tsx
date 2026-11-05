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
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm text-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                Fleet Digital Twin Simulation
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                SIMULATION
              </span>
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-slate-400" />
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 font-medium transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>Reset demo data</span>
          </button>

          <button
            onClick={() => setIsPurgeModalOpen(true)}
            title="Clear demo data"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-medium transition-colors cursor-pointer shadow-xs"
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

