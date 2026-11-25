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
  TrendingUp,
  AlertTriangle,
  Eye,
  Check,
  X,
  Truck,
  ShieldCheck,
  CloudRain,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import {
  MockReroute,
  RerouteMode,
  VehicleDigitalTwinData,
  RouteProblem,
} from '@nexus-ways/shared';
import { Button } from '../../../components/ui/button';
import { fleetTwinApi } from '../services/fleetTwinApi';
import { toast } from 'sonner';

interface RerouteComparisonCardProps {
  vehicleId: string;
  activeReroute?: MockReroute | null;
  twinData?: VehicleDigitalTwinData;
  onRerouteUpdated: () => void;
  onPreviewReroute?: (reroute: MockReroute | null) => void;
  previewReroute?: MockReroute | null;
}

export const RerouteComparisonCard: React.FC<RerouteComparisonCardProps> = ({
  vehicleId,
  activeReroute,
  twinData,
  onRerouteUpdated,
  onPreviewReroute,
  previewReroute,
}) => {
  const [selectedMode, setSelectedMode] = useState<RerouteMode>('balanced');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [localRecommendation, setLocalRecommendation] = useState<MockReroute | null>(
    activeReroute || null,
  );

  const modes: { id: RerouteMode; label: string; desc: string }[] = [
    { id: 'balanced', label: 'Balanced', desc: 'Optimal compromise on time & expense' },
    { id: 'fastest', label: 'Fastest', desc: 'Minimizes transit duration via high-speed expressway' },
    { id: 'cheapest', label: 'Cheapest', desc: 'Avoids premium expressways & high FASTag tolls' },
    { id: 'safest', label: 'Safest', desc: 'Bypasses severe weather & steep ghat hairpins' },
  ];

  const handleComputeReroute = async (mode: RerouteMode) => {
    setSelectedMode(mode);
    try {
      setIsCalculating(true);
      const res = await fleetTwinApi.calculateReroute(vehicleId, mode, twinData?.what_if);
      setLocalRecommendation(res);
      if (onPreviewReroute) {
        onPreviewReroute(res);
      }
      toast.success(`Evaluated alternate route for ${mode.toUpperCase()} mode.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to calculate alternate route');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleTogglePreview = () => {
    const target = localRecommendation || activeReroute;
    if (!target) return;
    if (previewReroute?.id === target.id) {
      if (onPreviewReroute) onPreviewReroute(null);
      toast.info('Alternate route preview dismissed.');
    } else {
      if (onPreviewReroute) onPreviewReroute(target);
      toast.info('Previewing alternate corridor on 2D map and 3D digital twin.');
    }
  };

  const handleAcceptConfirm = async () => {
    if (!localRecommendation) return;
    try {
      setIsSubmitting(true);
      const res = await fleetTwinApi.acceptReroute(vehicleId, localRecommendation.id);
      toast.success('Reroute Accepted: Dispatch updated. Completed section preserved.');
      setLocalRecommendation(res.reroute);
      setShowConfirmModal(false);
      if (onPreviewReroute) onPreviewReroute(null);
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
      if (onPreviewReroute) onPreviewReroute(null);
      onRerouteUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revert route');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rec = localRecommendation || activeReroute;
  const isAccepted = rec?.accepted;
  const isPreviewing = Boolean(previewReroute && rec && previewReroute.id === rec.id);

  const origMetrics = rec?.original_metrics;
  const altMetrics = rec?.alternate_metrics;
  const problems = rec?.problems || [];
  const feasibility = rec?.feasibility;

  // Comparison metrics rows
  const comparisonRows = [
    {
      label: 'Remaining Distance',
      current: origMetrics ? `${origMetrics.remaining_distance_km} km` : `${Math.round(twinData?.route?.total_distance_km || 354)} km`,
      alternate: altMetrics ? `${altMetrics.remaining_distance_km} km` : rec ? `+${rec.extra_distance_km} km` : '--',
      delta: rec ? (rec.extra_distance_km > 0 ? `+${rec.extra_distance_km} km` : `${rec.extra_distance_km} km`) : '--',
      isPositive: (rec?.extra_distance_km || 0) <= 0,
    },
    {
      label: 'Estimated Transit Time',
      current: origMetrics ? `${Math.floor(origMetrics.predicted_travel_time_minutes / 60)}h ${origMetrics.predicted_travel_time_minutes % 60}m` : '--',
      alternate: altMetrics ? `${Math.floor(altMetrics.predicted_travel_time_minutes / 60)}h ${altMetrics.predicted_travel_time_minutes % 60}m` : '--',
      delta: rec && rec.time_saved_minutes > 0 ? `-${rec.time_saved_minutes} min` : '0 min',
      isPositive: (rec?.time_saved_minutes || 0) > 0,
    },
    {
      label: 'Expected ETA',
      current: origMetrics ? new Date(origMetrics.expected_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : twinData?.predicted_eta ? new Date(twinData.predicted_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
      alternate: rec ? new Date(rec.new_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--',
      delta: rec && rec.time_saved_minutes > 0 ? `Saves ${rec.time_saved_minutes}m` : '--',
      isPositive: (rec?.time_saved_minutes || 0) > 0,
    },
    {
      label: 'Traffic Delay',
      current: origMetrics ? `+${origMetrics.traffic_delay_minutes} min` : `+${twinData?.total_predicted_delay_minutes || 0} min`,
      alternate: altMetrics ? `+${altMetrics.traffic_delay_minutes} min` : '--',
      delta: origMetrics && altMetrics ? `${altMetrics.traffic_delay_minutes - origMetrics.traffic_delay_minutes} min` : '--',
      isPositive: Boolean(origMetrics && altMetrics && altMetrics.traffic_delay_minutes <= origMetrics.traffic_delay_minutes),
    },
    {
      label: 'Weather Risk Score',
      current: origMetrics ? `${origMetrics.weather_risk_score}/100` : '--',
      alternate: altMetrics ? `${altMetrics.weather_risk_score}/100` : '--',
      delta: origMetrics && altMetrics ? `${altMetrics.weather_risk_score - origMetrics.weather_risk_score} pts` : '--',
      isPositive: Boolean(origMetrics && altMetrics && altMetrics.weather_risk_score <= origMetrics.weather_risk_score),
    },
    {
      label: 'FASTag Toll Cost',
      current: origMetrics ? `₹${origMetrics.toll_cost_inr}` : '--',
      alternate: altMetrics ? `₹${altMetrics.toll_cost_inr}` : '--',
      delta: rec ? (rec.toll_cost_delta_inr >= 0 ? `+₹${rec.toll_cost_delta_inr}` : `-₹${Math.abs(rec.toll_cost_delta_inr)}`) : '--',
      isPositive: (rec?.toll_cost_delta_inr || 0) <= 0,
    },
    {
      label: 'Fuel Expenditure',
      current: origMetrics ? `₹${origMetrics.fuel_cost_inr}` : '--',
      alternate: altMetrics ? `₹${altMetrics.fuel_cost_inr}` : '--',
      delta: rec ? (rec.fuel_cost_delta_inr >= 0 ? `+₹${rec.fuel_cost_delta_inr}` : `-₹${Math.abs(rec.fuel_cost_delta_inr)}`) : '--',
      isPositive: (rec?.fuel_cost_delta_inr || 0) <= 0,
    },
    {
      label: 'Total Operating Cost',
      current: origMetrics ? `₹${origMetrics.total_operating_cost_inr}` : '--',
      alternate: altMetrics ? `₹${altMetrics.total_operating_cost_inr}` : '--',
      delta: origMetrics && altMetrics ? (altMetrics.total_operating_cost_inr - origMetrics.total_operating_cost_inr >= 0 ? `+₹${altMetrics.total_operating_cost_inr - origMetrics.total_operating_cost_inr}` : `-₹${Math.abs(altMetrics.total_operating_cost_inr - origMetrics.total_operating_cost_inr)}`) : '--',
      isPositive: Boolean(origMetrics && altMetrics && altMetrics.total_operating_cost_inr <= origMetrics.total_operating_cost_inr),
    },
    {
      label: 'Route Risk Score',
      current: origMetrics ? `${origMetrics.route_risk_score}/100` : `${twinData?.risk_score || 0}/100`,
      alternate: altMetrics ? `${altMetrics.route_risk_score}/100` : '--',
      delta: rec ? (rec.risk_score_delta >= 0 ? `+${rec.risk_score_delta} pts` : `${rec.risk_score_delta} pts`) : '--',
      isPositive: (rec?.risk_score_delta || 0) <= 0,
    },
  ];

  return (
    <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-5 shadow-sm text-slate-900 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Intelligent Dynamic Rerouting Engine</span>
              {isAccepted && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                  ACCEPTED ACTIVE
                </span>
              )}
              {isPreviewing && !isAccepted && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-bold flex items-center gap-1">
                  <Eye className="w-3 h-3" /> PREVIEW ACTIVE
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">
              Live highway corridor optimization across Indian National Highway Network
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
              title={m.desc}
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

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current Highway Route Card */}
        <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wider text-slate-700">
              Assigned Highway Corridor
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-200/80 text-slate-700 text-[11px] font-mono">
              Current Active
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
                {twinData?.planned_eta
                  ? new Date(twinData.planned_eta).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '--'}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
              <div className="text-slate-500 text-[11px] flex items-center gap-1 font-medium">
                <Clock className="w-3 h-3 text-amber-600" /> Predicted ETA
              </div>
              <div className="font-mono font-bold text-amber-700 mt-1">
                {twinData?.predicted_eta
                  ? new Date(twinData.predicted_eta).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '--'}
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-600 flex items-center justify-between pt-1">
            <span className="font-medium">Identified Hazards:</span>
            <span className="font-mono font-bold text-rose-600">
              {problems.length} Segment {problems.length === 1 ? 'Bottleneck' : 'Bottlenecks'}
            </span>
          </div>
        </div>

        {/* Recommended Alternate Route Card */}
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
              <span>Recommended Alternate Corridor</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[11px] font-mono font-semibold uppercase">
              {selectedMode} Mode
            </span>
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
                  {new Date(rec.new_eta).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-xs">
              Click a mode above to compute alternate national corridors.
            </div>
          )}

          {rec && (
            <div className="text-xs space-y-1 pt-1 text-slate-600 border-t border-slate-200">
              <div className="flex justify-between">
                <span>Divergence Point:</span>
                <span className="font-semibold text-slate-900 font-mono">
                  {rec.divergence_point?.name || 'Sriperumbudur Interchange'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Preserved Completed:</span>
                <span className="font-semibold text-emerald-700 font-mono">
                  {twinData?.current_progress_pct ? `${twinData.current_progress_pct.toFixed(1)}% Travelled` : 'Maintained'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side-by-Side Feasibility Analysis Table */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            <span>Feasibility Analysis & Metrics Comparison</span>
          </h4>
          <span className="text-[11px] text-slate-500 font-medium">
            Evaluated from current GPS position to destination
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-semibold">
              <tr>
                <th className="py-2.5 px-3.5">Metric</th>
                <th className="py-2.5 px-3.5">Current Remaining Route</th>
                <th className="py-2.5 px-3.5">Recommended Alternate</th>
                <th className="py-2.5 px-3.5 text-right">Delta / Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {comparisonRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2 px-3.5 font-sans font-medium text-slate-700">{row.label}</td>
                  <td className="py-2 px-3.5 text-slate-600">{row.current}</td>
                  <td className="py-2 px-3.5 font-semibold text-indigo-950">{row.alternate}</td>
                  <td className="py-2 px-3.5 text-right">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                        row.isPositive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {row.isPositive ? (
                        <TrendingDown className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <TrendingUp className="w-3 h-3 text-slate-500" />
                      )}
                      <span>{row.delta}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Why Current Route is Problematic Section */}
      {problems.length > 0 && (
        <div className="space-y-3 p-4 rounded-xl bg-rose-50/60 border border-rose-200/80">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
              Why Current Route is Problematic ({problems.length} Critical Hazards Identified)
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {problems.map((prob) => (
              <div
                key={prob.id}
                className="p-3 rounded-lg bg-white border border-rose-200 shadow-2xs space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 truncate">{prob.location_name}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-100 text-slate-700">
                      {prob.status}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        prob.severity === 'critical'
                          ? 'bg-rose-100 text-rose-800'
                          : prob.severity === 'high'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {prob.severity}
                    </span>
                  </div>
                </div>

                <p className="text-slate-600 text-[11px] leading-relaxed">{prob.evidence}</p>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                  <span>Source: {prob.data_source}</span>
                  <span className="font-mono font-bold text-rose-600">
                    +{prob.expected_delay_minutes} min delay
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Why Alternate Route is Better */}
      {feasibility && feasibility.why_alternate_better.length > 0 && (
        <div className="space-y-2.5 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
              Why Alternate Route is Better
            </h4>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {feasibility.why_alternate_better.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 bg-white/90 p-2.5 rounded-lg border border-emerald-100 text-slate-700"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-[11px] leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Why This Route is Feasible (Operational Constraints) */}
      {feasibility && (
        <div className="space-y-2.5 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
              Operational Feasibility Assessment
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-white border border-indigo-100 space-y-1">
              <div className="font-semibold text-slate-800 text-[11px]">Road Accessibility</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {feasibility.why_feasible.road_accessibility}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-indigo-100 space-y-1">
              <div className="font-semibold text-slate-800 text-[11px]">Vehicle Compatibility</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {feasibility.why_feasible.vehicle_compatibility}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-indigo-100 space-y-1">
              <div className="font-semibold text-slate-800 text-[11px]">Traffic Advantage</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {feasibility.why_feasible.traffic_advantage}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-indigo-100 space-y-1">
              <div className="font-semibold text-slate-800 text-[11px]">Weather Suitability</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {feasibility.why_feasible.weather_suitability}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-indigo-100 space-y-1">
              <div className="font-semibold text-slate-800 text-[11px]">Time Feasibility</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {feasibility.why_feasible.time_feasibility}
              </p>
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-indigo-100 space-y-1">
              <div className="font-semibold text-slate-800 text-[11px]">FASTag & Rest Stops</div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                {feasibility.why_feasible.operational_constraints}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      {rec && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-600 max-w-md leading-relaxed">
            <strong className="text-slate-800 font-semibold">Engine Verdict:</strong> {rec.reason}
          </p>

          <div className="flex items-center gap-2.5">
            {/* Preview Alternate Route Button */}
            <Button
              variant="outline"
              onClick={handleTogglePreview}
              className={`text-xs h-9 gap-1.5 border-slate-300 cursor-pointer shadow-xs ${
                isPreviewing
                  ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                  : 'text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isPreviewing ? 'Dismiss Preview' : 'Preview Alternate Route'}</span>
            </Button>

            {/* Apply or Revert Button */}
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
                onClick={() => setShowConfirmModal(true)}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 gap-1.5 font-bold shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Apply Alternate Route</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Apply Route Confirmation Modal */}
      {showConfirmModal && rec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 text-slate-900 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Confirm Alternate Route Dispatch
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review route diversion parameters before updating commercial dispatch
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Target Vehicle:</span>
                <span className="font-mono font-bold text-slate-900">
                  {twinData?.vehicle?.registration_number || vehicleId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Divergence Interchange:</span>
                <span className="font-semibold text-slate-900">
                  {rec.divergence_point?.name || 'Sriperumbudur / Ranipet Interchange'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Alternate Corridor:</span>
                <span className="font-semibold text-indigo-700">{rec.recommended_route_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Travelled Section:</span>
                <span className="font-semibold text-emerald-700">
                  Preserved ({twinData?.current_progress_pct?.toFixed(1) || 28}% completed)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transit Duration Improvement:</span>
                <span className="font-mono font-bold text-emerald-700">
                  Saves {rec.time_saved_minutes} min
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Applying this recommendation updates the vehicle's remaining route geometry, waypoint
              checkpoints, and predicted timeline on the live dispatch board while retaining the
              completed portion.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="text-xs h-9 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAcceptConfirm}
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 font-bold shadow-xs cursor-pointer"
              >
                {isSubmitting ? 'Updating Dispatch...' : 'Confirm & Dispatch Route'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
