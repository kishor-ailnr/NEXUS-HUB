import React, { useState, useEffect, useCallback } from 'react';
import { Trip, TripCompletionReport } from '@nexus-ways/shared';
import { tripsService } from '../services/trips';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { X, History, FileText, Printer, Search, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface TripHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TripHistoryModal: React.FC<TripHistoryModalProps> = ({ isOpen, onClose }) => {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [selectedReport, setSelectedReport] = useState<TripCompletionReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tripsService.getTripHistory({
        status: statusFilter,
        search: search.trim() || undefined,
      });
      setTrips(data || []);
    } catch {
      toast.error('Failed to load trip history');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setSelectedReport(null);
    }
  }, [isOpen, loadHistory]);

  const handleViewReport = async (tripId: string) => {
    setReportLoading(true);
    try {
      const report = await tripsService.getCompletionReport(tripId);
      setSelectedReport(report);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load trip completion report');
    } finally {
      setReportLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Trip History and Completion Reports"
    >
      <div className="w-full max-w-4xl h-[88vh] bg-white rounded-2xl border border-slate-300 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Trip History &amp; Completion Reports</h2>
              <p className="text-xs text-slate-500">Persisted completed trips, ETA accuracy, and audit summaries</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
            aria-label="Close trip history"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        {!selectedReport && (
          <div className="shrink-0 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2 bg-white">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by vehicle, driver, source, or destination..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            {(['all', 'completed', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs rounded-md border capitalize cursor-pointer ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3 bg-slate-50/40">
          {selectedReport ? (
            <div className="space-y-4 bg-white p-5 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Trip Completion Report — {selectedReport.tripSummary.vehicleRegistration}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">Trip ID: {selectedReport.tripId}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => window.print()}
                    className="h-8 text-xs gap-1"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedReport(null)}
                    className="h-8 text-xs"
                  >
                    ← Back to History
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 uppercase text-[10px]">Trip Summary</div>
                  <div>Vehicle: <strong>{selectedReport.tripSummary.vehicleRegistration}</strong> ({selectedReport.tripSummary.vehicleType})</div>
                  <div>Driver: <strong>{selectedReport.tripSummary.driverName}</strong></div>
                  <div>Route: <strong>{selectedReport.tripSummary.source} → {selectedReport.tripSummary.destination}</strong></div>
                  <div>Cargo: {selectedReport.tripSummary.cargo}</div>
                  <div>Distance: {selectedReport.tripSummary.totalDistanceKm ?? 'Unavailable'} km</div>
                  <div>Duration: {selectedReport.tripSummary.totalDurationMinutes ?? 'Unavailable'} min</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 uppercase text-[10px]">Prediction Accuracy</div>
                  <div>Status: <strong>{selectedReport.tripSummary.deliveryStatus}</strong></div>
                  <div>Planned ETA: {new Date(selectedReport.predictionAccuracy.originalPlannedEta).toLocaleString()}</div>
                  <div>Predicted ETA: {new Date(selectedReport.predictionAccuracy.lastPredictedEta).toLocaleString()}</div>
                  <div>Actual Arrival: {new Date(selectedReport.predictionAccuracy.actualArrival).toLocaleString()}</div>
                  <div>ETA Error: {selectedReport.predictionAccuracy.errorMinutes !== null ? `${selectedReport.predictionAccuracy.errorMinutes} min` : 'Unavailable'}</div>
                  <div>Accuracy: {selectedReport.predictionAccuracy.accuracyPct !== null ? `${selectedReport.predictionAccuracy.accuracyPct}%` : 'Unavailable'}</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 uppercase text-[10px]">Operational &amp; Delay Analysis</div>
                  <div>Checkpoints: {selectedReport.operationalPerformance.checkpointsCompleted}/{selectedReport.operationalPerformance.checkpointsTotal}</div>
                  <div>Traffic: {selectedReport.delayAndRiskAnalysis.trafficDelays}</div>
                  <div>Weather: {selectedReport.delayAndRiskAnalysis.weatherDelays}</div>
                  <div>Toll: {selectedReport.delayAndRiskAnalysis.tollDelays}</div>
                  <div>Mechanical: {selectedReport.delayAndRiskAnalysis.mechanicalIncidents}</div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 uppercase text-[10px]">Alert &amp; Route Comparison</div>
                  <div>Alerts Generated: {selectedReport.alertSummary.alertsGenerated} (Acked: {selectedReport.alertSummary.alertsAcknowledged})</div>
                  <div>Highest Severity: {selectedReport.alertSummary.highestSeverity}</div>
                  <div>Planned Distance: {selectedReport.routeComparison.plannedDistanceKm ?? 'Unavailable'} km</div>
                  <div>Actual Distance: {selectedReport.routeComparison.actualDistanceKm ?? 'Unavailable'} km</div>
                  <div>Deviation: {selectedReport.routeComparison.deviationSummary}</div>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="text-center py-12 text-xs text-slate-500">Loading trip history...</div>
          ) : trips.length === 0 ? (
            <div className="text-center py-14 text-slate-400 text-xs">
              No completed or cancelled trips match your filters yet.
            </div>
          ) : (
            trips.map((t) => (
              <div
                key={t.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="font-mono">{t.vehicle?.registration_number || 'Vehicle'}</span>
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded border ${
                      t.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="text-slate-700">
                    {t.origin_label} → {t.destination_label}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Driver: {t.driver?.user?.full_name || 'N/A'} • {t.distance_km || 0} km •{' '}
                    {new Date(t.completed_at || t.created_at).toLocaleString()}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={reportLoading}
                  onClick={() => handleViewReport(t.id)}
                  className="h-8 text-xs gap-1.5 border-slate-300"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  Completion Report
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
