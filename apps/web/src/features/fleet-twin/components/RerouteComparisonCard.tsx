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
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-5 shadow-sm text-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Dynamic Rerouting Engine</h3>
            <p className="text-xs text-slate-500">
              Real-time time-dependent corridor optimization across Indian Highway Network
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => handleComputeReroute(m.id)}
              disabled={isCalculating}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                selectedMode === m.id
                  ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
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
        <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wider text-slate-700">
              Current Corridor
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[11px] font-mono">
              Primary Highway
            </span>
          </div>

          <div className="text-sm font-bold text-slate-900">
            {twinData?.route?.corridor || 'NH 48 Primary Expressway'}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
              <div className="text-slate-500 text-[11px] flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3 text-slate-400" /> Planned ETA
              </div>
              <div className="font-mono font-bold text-slate-900 mt-1">
                {twinData?.planned_eta ? new Date(twinData.planned_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
              <div className="text-slate-500 text-[11px] flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3 text-amber-600" /> Predicted ETA
              </div>
              <div className="font-mono font-bold text-amber-700 mt-1">
                {twinData?.predicted_eta ? new Date(twinData.predicted_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600 flex items-center justify-between pt-1">
            <span className="font-medium">Predicted Delay:</span>
            <span className="font-mono font-bold text-rose-600">
              +{twinData?.total_predicted_delay_minutes || 0} min
            </span>
          </div>
        </div>

        {/* Recommended Alternate Route */}
        <div
          className={`p-4 rounded-xl border space-y-3 transition-all ${
            rec
              ? 'bg-indigo-50/70 border-indigo-200 shadow-xs'
              : 'bg-slate-50/90 border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Recommended Alternate</span>
            </span>
            {isAccepted && (
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                ACCEPTED ACTIVE
              </span>
            )}
          </div>

          <div className="text-sm font-bold text-indigo-950">
            {rec?.recommended_route_name || 'NE 5 Access-Controlled Corridor'}
          </div>

          {rec ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white border border-emerald-200 shadow-2xs">
                <div className="text-slate-500 text-[11px] flex items-center gap-1 font-medium">
                  <TrendingDown className="w-3 h-3 text-emerald-600" /> Time Saved
                </div>
                <div className="font-mono font-bold text-emerald-700 mt-1">
                  {rec.time_saved_minutes} min
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white border border-indigo-200 shadow-2xs">
                <div className="text-slate-500 text-[11px] flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3 text-indigo-600" /> Optimized ETA
                </div>
                <div className="font-mono font-bold text-indigo-700 mt-1">
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
            <div className="text-xs space-y-1.5 pt-1 text-slate-600 border-t border-slate-200">
              <div className="flex justify-between">
                <span>Extra Distance:</span>
                <span className="font-mono font-semibold text-slate-800">+{rec.extra_distance_km} km</span>
              </div>
              <div className="flex justify-between">
                <span>Fuel Cost Delta:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {rec.fuel_cost_delta_inr >= 0 ? `+₹${rec.fuel_cost_delta_inr}` : `-₹${Math.abs(rec.fuel_cost_delta_inr)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Toll Difference:</span>
                <span className="font-mono font-semibold text-slate-800">
                  {rec.toll_cost_delta_inr >= 0 ? `+₹${rec.toll_cost_delta_inr}` : `-₹${Math.abs(rec.toll_cost_delta_inr)}`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      {rec && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-600 max-w-md leading-relaxed">
            <strong className="text-slate-800 font-semibold">Reason:</strong> {rec.reason}
          </p>

          <div className="flex items-center gap-2.5">
            {isAccepted ? (
              <Button
                variant="outline"
                onClick={handleRevert}
                disabled={isSubmitting}
                className="text-xs h-9 gap-1.5 border-slate-300 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Revert to Original</span>
              </Button>
            ) : (
              <Button
                onClick={handleAccept}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 gap-1.5 font-bold shadow-xs cursor-pointer"
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

