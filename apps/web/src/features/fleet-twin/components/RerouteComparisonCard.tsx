import React, { useState } from 'react';
import {
  Navigation,
  Clock,
  Fuel,
  CreditCard,
  ShieldAlert,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import {
  MockReroute,
  RerouteMode,
  VehicleDigitalTwinData,
} from '@nexus-ways/shared';
import { Button } from '../../../components/ui/button';
import { fleetTwinApi } from '../services/fleetTwinApi';
import { toast } from 'sonner';

interface RerouteComparisonCardProps {
  vehicleId: string;
  activeReroute?: MockReroute | null;
  twinData?: VehicleDigitalTwinData;
  onRerouteUpdated: () => void;
}

export const RerouteComparisonCard: React.FC<RerouteComparisonCardProps> = ({
  vehicleId,
  activeReroute,
  twinData,
  onRerouteUpdated,
}) => {
  const [selectedMode, setSelectedMode] = useState<RerouteMode>('balanced');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localRecommendation, setLocalRecommendation] = useState<MockReroute | null>(
    activeReroute || null,
  );

  const modes: { id: RerouteMode; label: string; desc: string }[] = [
    { id: 'balanced', label: 'Balanced', desc: 'Optimal compromise on time & expense' },
    { id: 'fastest', label: 'Fastest', desc: 'Minimizes transit duration regardless of toll fees' },
    { id: 'cheapest', label: 'Cheapest', desc: 'Avoids premium expressways & high toll barriers' },
    { id: 'safest', label: 'Safest', desc: 'Bypasses severe weather and high-incident ghats' },
  ];

  const handleComputeReroute = async (mode: RerouteMode) => {
    setSelectedMode(mode);
    try {
      setIsCalculating(true);
      const res = await fleetTwinApi.calculateReroute(vehicleId, mode, twinData?.what_if);
      setLocalRecommendation(res);
      toast.success(`Evaluated alternate route for ${mode.toUpperCase()} mode.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to calculate alternate route');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleAccept = async () => {
    if (!localRecommendation) return;
    try {
      setIsSubmitting(true);
      const res = await fleetTwinApi.acceptReroute(vehicleId, localRecommendation.id);
      toast.success('Reroute Accepted: Commercial dispatch order updated with new corridor.');
      setLocalRecommendation(res.reroute);
      onRerouteUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept reroute');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevert = async () => {
    try {
      setIsSubmitting(true);
      await fleetTwinApi.revertReroute(vehicleId);
      toast.info('Reverted back to original highway corridor.');
      setLocalRecommendation(null);
      onRerouteUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert route');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rec = localRecommendation || activeReroute;
  const isAccepted = rec?.accepted;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Dynamic Rerouting Engine</h3>
            <p className="text-xs text-slate-400">
              Real-time time-dependent corridor optimization across Indian Highway Network
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => handleComputeReroute(m.id)}
              disabled={isCalculating}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                selectedMode === m.id
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        {/* Current Highway Route */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-slate-300">
              Current Corridor
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono">
              Primary Highway
            </span>
          </div>

          <div className="text-sm font-bold text-white">
            {twinData?.route?.corridor || 'NH 48 Primary Expressway'}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
              <div className="text-slate-400 text-[11px] flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" /> Planned ETA
              </div>
              <div className="font-mono font-bold text-slate-200 mt-1">
                {twinData?.planned_eta ? new Date(twinData.planned_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
              <div className="text-slate-400 text-[11px] flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> Predicted ETA
              </div>
              <div className="font-mono font-bold text-amber-400 mt-1">
                {twinData?.predicted_eta ? new Date(twinData.predicted_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400 flex items-center justify-between pt-1">
            <span>Predicted Delay:</span>
            <span className="font-mono font-bold text-rose-400">
              +{twinData?.total_predicted_delay_minutes || 0} min
            </span>
          </div>
        </div>

        {/* Recommended Alternate Route */}
        <div
          className={`p-4 rounded-xl border space-y-3 transition-all ${
            rec
              ? 'bg-indigo-950/20 border-indigo-500/40 shadow-lg shadow-indigo-950/20'
              : 'bg-slate-950/30 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Recommended Alternate</span>
            </span>
            {isAccepted && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                ACCEPTED ACTIVE
              </span>
            )}
          </div>

          <div className="text-sm font-bold text-indigo-200">
            {rec?.recommended_route_name || 'NE 5 Access-Controlled Corridor'}
          </div>

          {rec ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-indigo-900/40">
                <div className="text-slate-400 text-[11px] flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-emerald-400" /> Time Saved
                </div>
                <div className="font-mono font-bold text-emerald-400 mt-1">
                  {rec.time_saved_minutes} min
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-900 border border-indigo-900/40">
                <div className="text-slate-400 text-[11px] flex items-center gap-1">
                  <Clock className="w-3 h-3 text-indigo-400" /> Optimized ETA
                </div>
                <div className="font-mono font-bold text-indigo-300 mt-1">
                  {new Date(rec.new_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-xs">
              Click a mode above to compute alternate national corridors.
            </div>
          )}

          {rec && (
            <div className="text-xs space-y-1.5 pt-1 text-slate-400 border-t border-slate-800">
              <div className="flex justify-between">
                <span>Extra Distance:</span>
                <span className="font-mono text-slate-300">+{rec.extra_distance_km} km</span>
              </div>
              <div className="flex justify-between">
                <span>Fuel Cost Delta:</span>
                <span className="font-mono text-slate-300">
                  {rec.fuel_cost_delta_inr >= 0 ? `+₹${rec.fuel_cost_delta_inr}` : `-₹${Math.abs(rec.fuel_cost_delta_inr)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Toll Difference:</span>
                <span className="font-mono text-slate-300">
                  {rec.toll_cost_delta_inr >= 0 ? `+₹${rec.toll_cost_delta_inr}` : `-₹${Math.abs(rec.toll_cost_delta_inr)}`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      {rec && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-400 max-w-md">
            <strong>Reason:</strong> {rec.reason}
          </p>

          <div className="flex items-center gap-2.5">
            {isAccepted ? (
              <Button
                variant="outline"
                onClick={handleRevert}
                disabled={isSubmitting}
                className="text-xs h-9 gap-1.5 border-slate-700 text-slate-300 hover:text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Revert to Original</span>
              </Button>
            ) : (
              <Button
                onClick={handleAccept}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 px-4 gap-1.5 font-bold shadow-lg shadow-indigo-950"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Accept Reroute</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

