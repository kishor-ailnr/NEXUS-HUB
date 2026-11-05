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
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-semibold tracking-wide uppercase">
        <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
        <span>SIMULATED DATA</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-cyan-500/10 border border-amber-500/30 shadow-lg text-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <Sparkles className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-300 tracking-wide uppercase">
                Simulated Fleet Digital Twin
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                MOCK DATA
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3 h-3 text-amber-400/80" />
              <span>
                Deterministic synthetic logistics data • Auto-cleans in 30 days
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            title="Idempotently re-seed mock fleet data"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>Reset Data</span>
          </button>

          <button
            onClick={() => setIsPurgeModalOpen(true)}
            title="Purge all simulated mock data"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Purge Mock Data</span>
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

