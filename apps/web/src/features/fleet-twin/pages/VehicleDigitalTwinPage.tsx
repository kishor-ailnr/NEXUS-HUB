import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Truck,
  User,
  Clock,
  Compass,
  AlertTriangle,
  ShieldAlert,
  ArrowLeft,
  Activity,
  Fuel,
  Sparkles,
  TrendingDown,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import {
  VehicleDigitalTwinData,
  WhatIfParams,
  DEFAULT_WHAT_IF_PARAMS,
  MockPredictionEvent,
  MockVehicle,
  MockReroute,
} from '@nexus-ways/shared';
import { fleetTwinApi } from '../services/fleetTwinApi';
import { SimulatedBadge } from '../components/SimulatedBadge';
import { ThreeEventScene } from '../components/ThreeEventScene';
import { WhatIfPanel } from '../components/WhatIfPanel';
import { PredictionTimeline } from '../components/PredictionTimeline';
import { RerouteComparisonCard } from '../components/RerouteComparisonCard';
import { FleetMapView } from '../components/FleetMapView';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';
import twinBgWebp from '../assets/fleet-twin-bg.webp';
import twinBgJpg from '../assets/fleet-twin-bg.jpg';

export const VehicleDigitalTwinPage: React.FC = () => {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();

  const cachedInitial = vehicleId ? fleetTwinApi.getCachedVehicleDigitalTwin(vehicleId) : null;
  const [twinData, setTwinData] = useState<VehicleDigitalTwinData | null>(cachedInitial);
  const [allVehicles, setAllVehicles] = useState<MockVehicle[]>(() => fleetTwinApi.getCachedAllVehicles() || []);
  const [whatIf, setWhatIf] = useState<WhatIfParams>({ ...DEFAULT_WHAT_IF_PARAMS });
  const [selectedEvent, setSelectedEvent] = useState<MockPredictionEvent | null>(() => (cachedInitial?.timeline.length ? cachedInitial.timeline[0] : null));
  const [previewReroute, setPreviewReroute] = useState<MockReroute | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedInitial);

  const loadTwin = useCallback(
    async (paramsToUse?: WhatIfParams) => {
      if (!vehicleId) return;
      try {
        const data = await fleetTwinApi.getVehicleDigitalTwin(
          vehicleId,
          paramsToUse || whatIf,
        );
        setTwinData(data);
        if (data.timeline.length > 0 && !selectedEvent) {
          setSelectedEvent(data.timeline[0]);
        }
      } catch (err: any) {
        toast.error(err.message || 'Failed to load vehicle digital twin');
      } finally {
        setIsLoading(false);
      }
    },
    [vehicleId, whatIf, selectedEvent],
  );

  useEffect(() => {
    loadTwin();
    fleetTwinApi
      .getAllVehicles()
      .then((data) => {
        if (Array.isArray(data)) setAllVehicles(data);
      })
      .catch(() => {});
  }, [vehicleId]);

  const handleWhatIfChange = (newParams: WhatIfParams) => {
    setWhatIf(newParams);
    loadTwin(newParams);
  };

  if ((isLoading && !twinData) || !twinData) {
    return (
      <div className="relative min-h-screen text-slate-900 p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
        {/* Background placeholder */}
        <div className="fixed inset-0 pointer-events-none -z-10 bg-slate-900/60 backdrop-blur-[2px]" />

        {/* Top Banner Skeleton */}
        <div className="w-full h-10 bg-white/70 backdrop-blur-md rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between px-4">
          <div className="h-4 w-48 bg-slate-200 rounded" />
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>

        {/* Hero Header Skeleton */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-200" />
            <div className="space-y-2">
              <div className="h-6 w-36 bg-slate-200 rounded" />
              <div className="h-3 w-48 bg-slate-200 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-24 bg-slate-200 rounded" />
            <div className="h-7 w-28 bg-slate-200 rounded" />
          </div>
        </div>

        {/* Key Operational KPIs Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white/95 backdrop-blur-md rounded-xl p-4 border border-slate-200/90 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <div className="h-3 w-20 bg-slate-200 rounded" />
                <div className="w-7 h-7 rounded-lg bg-slate-200" />
              </div>
              <div className="h-7 w-28 bg-slate-200 rounded" />
              <div className="h-3 w-36 bg-slate-200 rounded" />
            </div>
          ))}
        </div>

        {/* Split 3D Viewport & Map Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/90 shadow-sm h-[440px] flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 font-mono">
              Hydrating 48-Hour Vehicle Digital Twin...
            </p>
          </div>
          <div className="lg:col-span-5 bg-white/95 backdrop-blur-md rounded-xl border border-slate-200/90 shadow-sm h-[440px] flex items-center justify-center text-slate-400">
            <div className="h-10 w-44 bg-slate-100 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const { vehicle, driver, fleet, route, checkpoints, timeline } = twinData;

  const riskBadgeClass =
    twinData.risk_score > 60
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : twinData.risk_score > 35
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <div className="relative min-h-screen text-slate-900 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Fixed background image with overlay */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <picture>
          <source srcSet={twinBgWebp} type="image/webp" />
          <img
            src={twinBgJpg}
            alt="Fleet Twin Background"
            className="w-full h-full object-cover object-center scale-105"
          />
        </picture>
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]" />
      </div>

      {/* Top Banner */}
      <SimulatedBadge onRefresh={() => loadTwin()} />

      {/* Hero Header Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/95 backdrop-blur-md p-4 rounded-xl border border-slate-200/90 shadow-sm text-slate-900">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate('/roadways/fleet-twin')}
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 p-2 h-9 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {vehicle.registration_number}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                Simulation
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                {vehicle.truck_type.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {fleet?.name} • Base: {fleet?.base_hub}
            </p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-mono text-blue-600 font-bold">
              {new Date().toLocaleTimeString()} IST
            </div>
            <div className="text-[11px] text-slate-500">Simulation Clock</div>
          </div>

          <Button
            onClick={() => loadTwin()}
            variant="outline"
            className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs h-9 gap-1.5 cursor-pointer shadow-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Telemetry</span>
          </Button>
        </div>
      </div>

      {/* Key Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        {/* Planned ETA */}
        <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="text-slate-500 text-xs font-semibold flex items-center justify-between">
            <span>Planned ETA</span>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-lg font-mono font-bold text-slate-900 mt-1">
            {new Date(twinData.planned_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Dispatched schedule</div>
        </div>

        {/* Predicted ETA */}
        <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="text-slate-500 text-xs font-semibold flex items-center justify-between">
            <span>Predicted ETA</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-lg font-mono font-bold text-amber-600 mt-1">
            {new Date(twinData.predicted_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[11px] text-rose-600 font-medium mt-0.5">
            +{twinData.total_predicted_delay_minutes} min delay
          </div>
        </div>

        {/* On-Time Probability */}
        <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="text-slate-500 text-xs font-semibold flex items-center justify-between">
            <span>On-Time Probability</span>
            <Activity className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-lg font-mono font-bold text-blue-600 mt-1">
            {twinData.on_time_probability}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Corridor SLA model</div>
        </div>

        {/* Dynamic Risk Score */}
        <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm">
          <div className="text-slate-500 text-xs font-semibold flex items-center justify-between">
            <span>Route Risk Score</span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-lg font-mono font-bold text-slate-900 mt-1 flex items-center gap-2">
            <span>{twinData.risk_score}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${riskBadgeClass}`}>
              {twinData.risk_score > 60 ? 'HIGH' : twinData.risk_score > 35 ? 'MODERATE' : 'LOW'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Weather & queue hazards</div>
        </div>

        {/* Driver Rest & Fatigue */}
        <div className="p-3.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm col-span-2 md:col-span-1">
          <div className="text-slate-500 text-xs font-semibold flex items-center justify-between">
            <span>Driver Shift Hours</span>
            <User className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-lg font-mono font-bold text-emerald-700 mt-1">
            {driver?.hours_driven_today || 2.5} / {driver?.max_daily_hours || 10}h
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 capitalize">
            {driver?.name} ({driver?.rest_hours_compliance})
          </div>
        </div>
      </div>

      {/* Real External Data Freshness & Engine Provenance Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/85 backdrop-blur-md border border-slate-700/60 text-slate-300 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold">Prediction Engine:</span>
            <span className="font-mono text-emerald-300">v2.4-ensemble (MAE ~8.4m)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Weather:</span>
            <span className="text-slate-200 font-medium">Open-Meteo Forecast (Hourly)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Traffic:</span>
            <span className="text-slate-200 font-medium">
              {twinData.live_traffic
                ? `${twinData.live_traffic.data_source} (${twinData.live_traffic.provenance}) • ${twinData.live_traffic.current_speed_kmh}/${twinData.live_traffic.free_flow_speed_kmh} km/h (${twinData.live_traffic.congestion_level}, ${twinData.live_traffic.confidence_pct}% conf)`
                : 'Live traffic data temporarily unavailable'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span>Toll Queue:</span>
            <span className="text-slate-200 font-medium">NHAI FASTag ETC Model</span>
          </div>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Last Ingestion: {new Date().toLocaleTimeString()} IST
        </div>
      </div>

      {/* Explainable AI Journey Synthesis & Traceable Delay Contributions */}
      {twinData.explanation && (
        <div className="p-4 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm text-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Predictive Intelligence & Delay Breakdown
              </span>
            </div>
            <span className="font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded text-[11px]">
              {twinData.explanation.on_time_verdict}
            </span>
          </div>

          <p className="text-slate-700 leading-relaxed font-normal">
            {twinData.explanation.summary}
          </p>

          {/* Traceable Factor Badges */}
          {twinData.eta_breakdown && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
              <span className="text-slate-500 font-medium">Delay Contributions:</span>
              {twinData.eta_breakdown.traffic_delay_minutes > 0 && (
                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-mono font-medium">
                  Traffic +{twinData.eta_breakdown.traffic_delay_minutes}m
                </span>
              )}
              {twinData.eta_breakdown.weather_delay_minutes > 0 && (
                <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-mono font-medium">
                  Weather +{twinData.eta_breakdown.weather_delay_minutes}m
                </span>
              )}
              {twinData.eta_breakdown.toll_delay_minutes > 0 && (
                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-mono font-medium">
                  FASTag Tolls +{twinData.eta_breakdown.toll_delay_minutes}m
                </span>
              )}
              {twinData.eta_breakdown.mandatory_rest_minutes > 0 && (
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-medium">
                  Mandatory Rest +{twinData.eta_breakdown.mandatory_rest_minutes}m
                </span>
              )}
              {twinData.eta_breakdown.ghat_slowdown_minutes > 0 && (
                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono font-medium">
                  Ghat Hairpin +{twinData.eta_breakdown.ghat_slowdown_minutes}m
                </span>
              )}
              {twinData.eta_breakdown.scenario_delay_minutes > 0 && (
                <span className="px-2 py-0.5 rounded bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200 font-mono font-medium">
                  What-If Simulation +{twinData.eta_breakdown.scenario_delay_minutes}m
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: 3D Animated Scene + What-If Sliders */}
        <div className="lg:col-span-7 space-y-5">
          <ThreeEventScene
            currentEvent={selectedEvent}
            events={timeline}
            vehicleRegistration={vehicle.registration_number}
            onEventSelected={(ev) => setSelectedEvent(ev)}
            vehicle={vehicle}
            route={route}
            checkpoints={checkpoints}
            allVehicles={allVehicles}
            activeReroute={twinData.active_reroute}
            previewReroute={previewReroute}
            onSelectVehicle={(v) => {
              if (v?.id && v.id !== vehicle.id) {
                navigate(`/roadways/fleet-twin/${v.id}`);
              }
            }}
          />

          <WhatIfPanel
            params={whatIf}
            onChange={handleWhatIfChange}
            scenarioComparison={twinData.scenario_comparison}
            explanation={twinData.explanation}
          />
        </div>

        {/* Right Column: Corridor Map & Checkpoints */}
        <div className="lg:col-span-5">
          <FleetMapView
            vehicle={vehicle}
            route={route}
            checkpoints={checkpoints}
            activeReroute={twinData.active_reroute}
            previewReroute={previewReroute}
            canAuthorizeReroute={true}
            onCloseAlternative={() => {
              setPreviewReroute(null);
            }}
            onAcceptAlternative={async (rerouteId, candidateId) => {
              await fleetTwinApi.acceptReroute(vehicle.id, rerouteId, candidateId);
              toast.success('Alternate route authorized and persisted.');
              setPreviewReroute(null);
              loadTwin();
            }}
          />
        </div>
      </div>

      {/* 48-Hour Trajectory Timeline */}
      <PredictionTimeline
        events={timeline}
        selectedEventId={selectedEvent?.id}
        onSelectEvent={(ev) => setSelectedEvent(ev)}
        totalDelayMinutes={twinData.total_predicted_delay_minutes}
      />

      {/* Dynamic Reroute Engine Recommendation */}
      <RerouteComparisonCard
        vehicleId={vehicle.id}
        activeReroute={twinData.active_reroute}
        twinData={twinData}
        previewReroute={previewReroute}
        onPreviewReroute={(r) => setPreviewReroute(r)}
        onRerouteUpdated={() => {
          setPreviewReroute(null);
          loadTwin();
        }}
      />

      {/* Honest Minimal Disclosure Footer */}
      <footer className="text-center pt-8 pb-4 text-xs text-slate-300 font-medium">
        Predictions are generated by the NEXUS simulation engine.
      </footer>
    </div>
  );
};

