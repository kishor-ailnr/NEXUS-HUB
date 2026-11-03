import React, { useState, useEffect } from 'react';
import {
  VoyageMovement,
  LiveVesselTelemetryPayload,
  UserRole,
  VoyageMovementEtaResponse,
  SeaCrewScore,
  WatchkeepingLog,
} from '@nexus-ways/shared';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Ship,
  X,
  Play,
  CheckCircle2,
  Clock,
  Navigation,
  Compass,
  Anchor,
  User,
  ShieldCheck,
  Radio,
  Layers,
  Leaf,
  FileText,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { seawaysService } from '../services/seaways';
import { toast } from 'sonner';

interface VoyageMovementDetailsPanelProps {
  movement: VoyageMovement | null;
  liveTelemetry?: LiveVesselTelemetryPayload | null;
  liveData?: LiveVesselTelemetryPayload | null;
  userRole?: UserRole;
  onClose: () => void;
  onRefresh?: () => void;
  onStatusChange?: () => void;
}

export const VoyageMovementDetailsPanel: React.FC<VoyageMovementDetailsPanelProps> = ({
  movement,
  liveTelemetry,
  liveData,
  userRole,
  onClose,
  onRefresh = () => {},
  onStatusChange = () => {},
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isOpeningReport, setIsOpeningReport] = useState(false);
  const [etaData, setEtaData] = useState<VoyageMovementEtaResponse | null>(null);
  const [crewScores, setCrewScores] = useState<SeaCrewScore[]>([]);
  const [watchkeepingLogs, setWatchkeepingLogs] = useState<WatchkeepingLog[]>([]);

  useEffect(() => {
    if (movement?.id) {
      seawaysService.getEta(movement.id).then(setEtaData).catch(() => null);
      seawaysService.getCrewScore(movement.id).then(setCrewScores).catch(() => null);
    }
    if (movement?.master_id) {
      seawaysService.getWatchkeepingLogs(movement.master_id).then(setWatchkeepingLogs).catch(() => null);
    }
  }, [movement?.id, movement?.master_id, movement?.status]);

  if (!movement) return null;

  const telemetry = liveTelemetry || liveData;
  const isManager = userRole === 'manager';
  const isInTransit = movement.status === 'in_transit';
  const isCompleted = movement.status === 'completed';
  const isPlanned = movement.status === 'planned';

  const speedKnots = (telemetry as any)?.speed_knots ?? (telemetry as any)?.speedKnots ?? (movement.latest_telemetry?.speed_knots || 0);
  const heading = telemetry?.heading ?? (movement.latest_telemetry?.heading || 0);
  const progressPercent = (telemetry as any)?.progress_percent ?? (telemetry as any)?.progressPercent ?? (isCompleted ? 100 : isInTransit ? 45 : 0);

  const routingSource = movement.route_geometry?.routing_source || 'searoute';

  const latestScore = crewScores.length > 0 ? crewScores[0].score : (movement.crew_score?.score ?? 100);
  const latestWatch = watchkeepingLogs.length > 0 ? watchkeepingLogs[0] : null;

  const handleStartTransit = async () => {
    try {
      setIsUpdating(true);
      await seawaysService.updateMovementStatus(movement.id, 'in_transit');
      toast.success(`Voyage ${movement.voyage?.voyage_number} dispatched into transit!`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch voyage movement');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelMovement = async () => {
    try {
      setIsUpdating(true);
      await seawaysService.updateMovementStatus(movement.id, 'cancelled');
      toast.info(`Voyage movement ${movement.voyage?.voyage_number} cancelled.`);
      onRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel voyage movement');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      setIsOpeningReport(true);
      const res = await seawaysService.getReportUrl(movement.id);
      if (res.signedUrl) {
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('No signed PDF report URL returned');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch voyage audit report');
    } finally {
      setIsOpeningReport(false);
    }
  };

  const teu = movement.vessel?.teu_capacity || (movement.vessel?.dwt_tonnes ? Math.round(movement.vessel.dwt_tonnes / 13) : 5000);
  const carbonBucketName = teu >= 8000 ? 'ULCV (8,000+ TEU)' : teu < 3000 ? 'Feeder (<3,000 TEU fallback)' : 'Panamax / Neo-Panamax (3k–8k TEU)';
  const carbonFactor = teu >= 8000 ? 0.0076 : 0.0091;
  const railSavingsText = teu >= 8000 ? '~28% lower than rail' : '~14% lower than rail';

  return (
    <div className="w-80 md:w-96 flex flex-col h-full bg-white border-l border-slate-800 text-slate-800 select-none overflow-y-auto shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-200/80 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg">
            <Ship className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{movement.voyage?.voyage_number || 'Voyage'}</h3>
            <p className="text-xs text-slate-500">{movement.vessel?.vessel_name || 'Vessel'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
          aria-label="Close voyage details"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 bg-slate-50/40 flex-1">
        {/* Status & Routing Source */}
        <div className="flex items-center justify-between">
          <Badge
            variant="outline"
            className={`text-xs uppercase font-semibold px-2 py-0.5 ${
              isInTransit
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 animate-pulse'
                : isCompleted
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            {movement.status.replace('_', ' ')}
          </Badge>

          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-semibold">
            {routingSource}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-slate-800 shadow-xs">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-medium">Voyage Transit Progress</span>
            <span className="font-bold text-blue-600 font-mono">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
            <span>{movement.voyage?.origin_port?.name || 'Origin'}</span>
            <span>{movement.voyage?.destination_port?.name || 'Destination'}</span>
          </div>
        </div>

        {/* ETA Confidence Badge & Intelligence Card */}
        {etaData && (
          <div className="p-3.5 rounded-xl border border-slate-800 bg-white shadow-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-slate-800 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Estimated Voyage Duration
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] px-1.5 py-0 font-semibold ${
                  etaData.confidence_basis === 'historical'
                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50'
                    : 'border-blue-200 text-blue-700 bg-blue-50'
                }`}
              >
                {etaData.confidence_basis === 'historical'
                  ? `Historical Sample (N=${etaData.sample_size})`
                  : 'Default Maritime Band (±15%)'}
              </Badge>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-base font-bold text-blue-700">
                {etaData.base_eta_minutes} min
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Band: {etaData.min_eta_minutes}m – {etaData.max_eta_minutes}m (±{etaData.confidence_band_minutes}m)
              </span>
            </div>
          </div>
        )}

        {/* Maritime Carbon Footprint (DWT-bucketed) */}
        <div className="p-3 rounded-xl border border-slate-800 bg-white shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-slate-800 flex items-center gap-1">
              <Leaf className="w-3.5 h-3.5 text-emerald-600" />
              Maritime Carbon Footprint
            </span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-emerald-300 text-emerald-700 bg-emerald-50">
              GLEC v3.2 §5.3
            </Badge>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-base font-bold text-emerald-600">
              {movement.carbon_kg ? `${movement.carbon_kg.toLocaleString()} kg CO₂e` : 'Est. 40,950 kg CO₂e'}
            </span>
            <span className="text-[10px] text-emerald-700 font-mono font-medium">
              {carbonBucketName}
            </span>
          </div>
          <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-100 flex justify-between">
            <span>Factor: {carbonFactor} kg/t-km</span>
            <span className="text-emerald-700 font-medium">{railSavingsText}</span>
          </div>
        </div>

        {/* Master Behavior & STCW Watchkeeping Score */}
        <div className="grid grid-cols-2 gap-2">
          {/* Master Safety Score */}
          <div className="p-2.5 rounded-xl border border-slate-800 bg-white shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-blue-600" />
                Master Score
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-base font-bold font-mono ${latestScore >= 90 ? 'text-emerald-600' : latestScore >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                {latestScore}
              </span>
              <span className="text-[10px] text-slate-400">/ 100</span>
            </div>
            <div className="text-[9px] text-slate-500 truncate">
              {crewScores.length > 0 && crewScores[0].harsh_maneuver_count > 0 ? `${crewScores[0].harsh_maneuver_count} ROT alerts` : 'Safe ROT (≤20°/m)'}
            </div>
          </div>

          {/* STCW Watchkeeping Status */}
          <div className="p-2.5 rounded-xl border border-slate-800 bg-white shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                <Clock className="w-3 h-3 text-cyan-600" />
                STCW Rest Hours
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xs font-bold ${latestWatch?.violation ? 'text-red-600' : 'text-emerald-600'}`}>
                {latestWatch?.violation ? 'Non-Compliant' : 'Compliant'}
              </span>
            </div>
            <div className="text-[9px] text-slate-500 truncate">
              STCW Code Sec A-VIII/1
            </div>
          </div>
        </div>

        {/* Port Pair Card */}
        <Card className="bg-white border-slate-800 shadow-xs">
          <CardHeader className="p-3 pb-1.5">
            <CardTitle className="text-xs text-slate-600 font-medium flex items-center gap-1">
              <Anchor className="w-3.5 h-3.5 text-blue-600" />
              Maritime Route Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <div>
                <div className="font-semibold text-slate-900">{movement.voyage?.origin_port?.name || 'Origin Port'}</div>
                <div className="text-[10px] text-slate-500">
                  {movement.voyage?.origin_port?.unlocode ? `UN/LOCODE: ${movement.voyage.origin_port.unlocode}` : ''}
                </div>
              </div>
              <span className="text-slate-400">→</span>
              <div className="text-right">
                <div className="font-semibold text-slate-900">{movement.voyage?.destination_port?.name || 'Dest Port'}</div>
                <div className="text-[10px] text-slate-500">
                  {movement.voyage?.destination_port?.unlocode ? `UN/LOCODE: ${movement.voyage.destination_port.unlocode}` : ''}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 text-slate-500">
              <div>
                <span>Sea Distance:</span>
                <span className="text-slate-800 font-medium ml-1">
                  {movement.distance_km ? `${movement.distance_km} km` : 'N/A'}
                </span>
              </div>
              <div>
                <span>Nautical Miles:</span>
                <span className="text-slate-800 font-medium ml-1">
                  {movement.distance_km ? `${Math.round(movement.distance_km / 1.852)} NM` : 'N/A'}
                </span>
              </div>
              <div>
                <span>Est. Duration:</span>
                <span className="text-slate-800 font-medium ml-1">
                  {movement.duration_minutes ? `${movement.duration_minutes} min` : 'N/A'}
                </span>
              </div>
              <div>
                <span>Speed Multiplier:</span>
                <span className="text-slate-800 font-medium ml-1">
                  {movement.simulation_speed_multiplier || 60}x
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Telemetry */}
        <Card className="bg-white border-slate-800 shadow-xs">
          <CardHeader className="p-3 pb-1.5">
            <CardTitle className="text-xs text-slate-600 font-medium flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-blue-600" />
              Live Vessel Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <div>
                <span>Current Speed:</span>
                <span className="text-emerald-600 font-bold ml-1">{speedKnots} knots</span>
              </div>
              <div>
                <span>Speed (km/h):</span>
                <span className="text-slate-800 font-medium ml-1">{Math.round(speedKnots * 1.852)} km/h</span>
              </div>
              <div>
                <span>True Heading:</span>
                <span className="text-slate-800 font-medium ml-1">{heading}°</span>
              </div>
              <div>
                <span>Navigation Status:</span>
                <span className="text-blue-700 font-medium ml-1 capitalize">{movement.status}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vessel & Master Info */}
        <Card className="bg-white border-slate-800 shadow-xs">
          <CardHeader className="p-3 pb-1.5">
            <CardTitle className="text-xs text-slate-600 font-medium flex items-center gap-1">
              <Ship className="w-3.5 h-3.5 text-blue-600" />
              Vessel & Master Manifest
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Vessel Name:</span>
              <span className="font-semibold text-slate-900">{movement.vessel?.vessel_name}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Vessel Type:</span>
              <span className="text-slate-700">{movement.vessel?.vessel_type}</span>
            </div>
            {movement.vessel?.imo_number && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">IMO Number:</span>
                <span className="font-mono text-slate-700">{movement.vessel.imo_number}</span>
              </div>
            )}
            {movement.vessel?.dwt_tonnes && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Deadweight:</span>
                <span className="text-slate-700">{movement.vessel.dwt_tonnes.toLocaleString()} DWT</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Master / Captain:</span>
                <span className="font-semibold text-slate-900">{movement.master?.user?.full_name}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">CoC Number:</span>
                <span className="font-mono text-slate-700">{movement.master?.certificate_number}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PDF Voyage Report Download Button */}
        {isCompleted && (
          <div className="p-3 rounded-xl bg-white border border-slate-800 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Audit Report Ready
              </span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-blue-200 text-blue-700 bg-blue-50">
                PDF Generated
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500">
              Verified voyage ledger with DWT-bucketed GLEC carbon, STCW rest-hour compliance, and harbor berth log.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadReport}
              disabled={isOpeningReport}
              className="w-full text-xs h-8 gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 shadow-xs"
            >
              {isOpeningReport ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              Download Voyage PDF Report
            </Button>
          </div>
        )}

        {/* Actions */}
        {isManager && (
          <div className="space-y-2 pt-2">
            {isPlanned && (
              <Button
                size="sm"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 flex items-center justify-center gap-1.5"
                onClick={handleStartTransit}
                disabled={isUpdating}
              >
                <Play className="w-4 h-4" />
                Dispatch Vessel Into Transit
              </Button>
            )}

            {(isPlanned || isInTransit) && (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-red-900/60 text-red-400 hover:bg-red-950/40 text-xs h-8"
                onClick={handleCancelMovement}
                disabled={isUpdating}
              >
                Cancel Voyage Movement
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
