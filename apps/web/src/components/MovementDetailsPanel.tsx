import React, { useState, useEffect } from 'react';
import { TrainMovement, UserRole, TrainMovementEtaResponse } from '@nexus-ways/shared';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  TrainFront,
  MapPin,
  Clock,
  User,
  Zap,
  Play,
  CheckCircle2,
  X,
  Radio,
  Layers,
  Leaf,
  ShieldCheck,
  FileText,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { railwaysService } from '../services/railways';
import { LiveRailTelemetryPayload } from '../services/socket';
import { toast } from 'sonner';

interface MovementDetailsPanelProps {
  movement: TrainMovement;
  liveTelemetry?: LiveRailTelemetryPayload;
  onClose: () => void;
  onRefresh: () => void;
  userRole?: UserRole;
}

export const MovementDetailsPanel: React.FC<MovementDetailsPanelProps> = ({
  movement,
  liveTelemetry,
  onClose,
  onRefresh,
  userRole,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [etaData, setEtaData] = useState<TrainMovementEtaResponse | null>(null);
  const [loadingEta, setLoadingEta] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const isManager = userRole === 'manager';

  // Load ETA confidence
  useEffect(() => {
    if (movement?.id && (movement.status === 'in_transit' || movement.status === 'planned')) {
      setLoadingEta(true);
      railwaysService
        .getEta(movement.id)
        .then((res) => setEtaData(res))
        .catch(() => setEtaData(null))
        .finally(() => setLoadingEta(false));
    } else {
      setEtaData(null);
    }
  }, [movement?.id, movement?.status]);

  const handleStatusChange = async (newStatus: 'in_transit' | 'completed' | 'cancelled') => {
    try {
      setIsUpdating(true);
      await railwaysService.updateMovementStatus(movement.id, newStatus);
      toast.success(`Movement status updated to ${newStatus}`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update movement status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingReport(true);
      const res = await railwaysService.getReportUrl(movement.id);
      if (res?.signedUrl) {
        window.open(res.signedUrl, '_blank');
        toast.success('Rail movement audit PDF opened.');
      } else {
        toast.error('Unable to retrieve signed report URL.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load movement report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const speedKmh = liveTelemetry?.speedKmh ?? (movement.status === 'in_transit' ? 75 : 0);
  const fuelType = movement.train?.locomotive?.fuel_type || 'electric';
  const emissionFactor = fuelType === 'diesel' ? 0.032 : 0.021;
  const distanceKm = movement.distance_km || 300;
  const cargoTonnes = 1500;
  const calculatedCarbonKg =
    movement.carbon_kg || Math.round(distanceKm * cargoTonnes * emissionFactor * 100) / 100;
  const roadEquivCarbonKg = Math.round(distanceKm * cargoTonnes * 0.101 * 100) / 100;
  const percentSavedVsRoad = Math.round(
    ((roadEquivCarbonKg - calculatedCarbonKg) / Math.max(1, roadEquivCarbonKg)) * 100,
  );

  const crewScore = movement.crew_score?.score ?? 100;
  const harshBrakes = movement.crew_score?.harsh_brake_count ?? 0;
  const overspeeds = movement.crew_score?.overspeed_event_count ?? 0;

  return (
    <Card className="w-80 md:w-88 h-full bg-white border-l border-slate-800 rounded-none flex flex-col text-slate-800 select-none shadow-xl">
      {/* Header */}
      <CardHeader className="p-4 border-b border-slate-200/80 bg-white flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <TrainFront className="w-4 h-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              {movement.train?.train_number || 'Movement'}
            </CardTitle>
            <p className="text-[11px] text-slate-500">{movement.train?.train_name || 'Rail Service'}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Close rail movement details"
        >
          <X className="w-4 h-4" />
        </button>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 text-xs bg-slate-50/40">
        {/* Status & Live Telemetry Banner */}
        <div className="p-3.5 bg-white border border-slate-800 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-medium">Movement Status</span>
            <Badge
              variant="outline"
              className={
                movement.status === 'in_transit'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse font-semibold'
                  : movement.status === 'completed'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }
            >
              {movement.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
            <div>
              <span className="text-slate-400">Live Speed:</span>
              <p className="font-bold text-slate-900 flex items-center gap-1 mt-0.5">
                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                {speedKmh} km/h
              </p>
            </div>
            <div>
              <span className="text-slate-400">Routing:</span>
              <p className="font-semibold text-slate-700 mt-0.5">
                {movement.route_geometry?.routing_source || 'overpass'}
              </p>
            </div>
          </div>
        </div>

        {/* ETA Confidence Card */}
        {etaData && (
          <div className="p-3.5 bg-white border border-slate-800 rounded-xl shadow-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-blue-700 font-semibold flex items-center gap-1.5 text-[11px]">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                Predictive ETA Confidence
              </span>
              <Badge
                variant="outline"
                className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 font-semibold"
              >
                {etaData.confidence_basis === 'historical'
                  ? `Historical (N=${etaData.sample_size})`
                  : 'Default (±15%)'}
              </Badge>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-lg font-bold text-slate-900 font-mono">{etaData.base_eta_minutes} min</span>
              <span className="text-[11px] text-blue-600 font-medium">
                Range: {etaData.min_eta_minutes} – {etaData.max_eta_minutes} min (±
                {etaData.confidence_band_minutes}m)
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              Remaining: ~{etaData.remaining_distance_km} km to destination station
            </p>
          </div>
        )}

        {/* Crew Behavior Score */}
        <div className="p-3.5 bg-white border border-slate-800 rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-700 font-semibold flex items-center gap-1.5 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Loco Pilot Crew Score
            </span>
            <span
              className={`font-bold text-sm font-mono ${
                crewScore >= 85 ? 'text-emerald-600' : crewScore >= 70 ? 'text-amber-600' : 'text-rose-600'
              }`}
            >
              {crewScore} / 100
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">
            <div>
              <span>Harsh Brakes:</span>
              <p className="font-semibold text-slate-800">{harshBrakes} event(s)</p>
            </div>
            <div>
              <span>Overspeed (&gt;100 km/h):</span>
              <p className="font-semibold text-slate-800">{overspeeds} event(s)</p>
            </div>
          </div>
        </div>

        {/* Environmental Intelligence */}
        <div className="p-3.5 bg-white border border-slate-800 rounded-xl shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-emerald-700 font-semibold flex items-center gap-1.5 text-[11px]">
              <Leaf className="w-3.5 h-3.5 text-emerald-600" />
              Rail Carbon Intelligence
            </span>
            <Badge
              variant="outline"
              className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 uppercase font-semibold"
            >
              {fuelType} Rail
            </Badge>
          </div>
          <div className="flex items-baseline justify-between pt-0.5">
            <span className="text-base font-bold text-slate-900 font-mono">{calculatedCarbonKg} kg CO₂e</span>
            <span className="text-[10.5px] font-semibold text-emerald-700">
              {percentSavedVsRoad}% cleaner vs road
            </span>
          </div>
          <p className="text-[9.5px] text-slate-500">
            GLEC Framework v3.0 ({emissionFactor} kg CO₂e/t-km vs Road 0.101 kg/t-km)
          </p>
        </div>

        {/* Route Details */}
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-700 text-xs">Station Corridor</h3>
          <div className="p-3.5 bg-white border border-slate-800 rounded-xl shadow-xs space-y-3">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Origin Station</span>
                <p className="font-bold text-slate-900">{movement.origin_station?.name}</p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {movement.origin_station?.lat?.toFixed(4)}, {movement.origin_station?.lng?.toFixed(4)}
                </p>
              </div>
            </div>

            <div className="border-l-2 border-dashed border-slate-200 ml-2 pl-3 py-1 space-y-1">
              <span className="text-[10px] text-slate-500 font-mono">
                Track Distance: {movement.distance_km || 0} km • Est. Time: {movement.duration_minutes || 0} min
              </span>
            </div>

            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-slate-400 font-medium">Destination Station</span>
                <p className="font-bold text-slate-900">{movement.destination_station?.name}</p>
                <p className="text-[10px] text-slate-400 font-mono">
                  {movement.destination_station?.lat?.toFixed(4)}, {movement.destination_station?.lng?.toFixed(4)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Train & Crew Info */}
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-700 text-xs">Rolling Stock & Crew</h3>
          <div className="p-3.5 bg-white border border-slate-800 rounded-xl shadow-xs space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                Locomotive
              </span>
              <span className="font-semibold text-slate-800">
                {movement.train?.locomotive?.loco_number || 'Standard Power'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-500" />
                Rake
              </span>
              <span className="font-semibold text-slate-800">
                {movement.train?.rake?.rake_id || 'Standard'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
              <span className="text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                Loco Pilot
              </span>
              <span className="font-semibold text-slate-800">
                {movement.loco_pilot?.user?.full_name || 'Loco Pilot'}
              </span>
            </div>
          </div>
        </div>

        {/* PDF Movement Audit Report */}
        {movement.status === 'completed' && (
          <Button
            onClick={handleDownloadPdf}
            disabled={downloadingReport}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border-none gap-2 h-9 font-semibold shadow-xs"
          >
            <FileText className="w-4 h-4" />
            {downloadingReport ? 'Opening Report...' : 'View Rail Audit PDF'}
          </Button>
        )}

        {/* Manager Action Buttons */}
        {isManager && (
          <div className="pt-2 space-y-2">
            {movement.status === 'planned' && (
              <Button
                onClick={() => handleStatusChange('in_transit')}
                disabled={isUpdating}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-1.5 h-9 font-semibold shadow-xs"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Train Movement
              </Button>
            )}

            {movement.status === 'in_transit' && (
              <Button
                onClick={() => handleStatusChange('completed')}
                disabled={isUpdating}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-9 font-semibold shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark Completed
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
