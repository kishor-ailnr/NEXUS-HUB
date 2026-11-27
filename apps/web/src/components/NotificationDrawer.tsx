import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  CheckCheck,
  ExternalLink,
  X,
  AlertTriangle,
  Info,
  BellRing,
  ShieldAlert,
  Clock,
  CheckCircle2,
  PlayCircle,
  MapPin,
  Truck,
  User,
  Search,
  Maximize2,
  Minimize2,
  Navigation,
} from 'lucide-react';
import {
  NotificationItem,
  PrioritizedAlertItem,
  PrioritizedAlertsSummary,
  AlertLifecycleUpdateRequest,
} from '@nexus-ways/shared';
import { notificationsService } from '../services/notifications';
import { useMapCameraStore } from '../store/mapCameraStore';
import { useDashboardDataStore } from '../store/dashboardDataStore';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

interface NotificationDrawerProps {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkAsRead: (id: string) => Promise<void>;
  onRefresh?: () => void;
}

type AlertFilterKey =
  | 'active'
  | 'all'
  | 'P1'
  | 'P2'
  | 'P3'
  | 'P4'
  | 'unacknowledged'
  | 'acknowledged'
  | 'resolved';

const PRIORITY_STYLE: Record<
  string,
  { border: string; bg: string; badge: string; label: string }
> = {
  P1: {
    border: 'border-rose-300',
    bg: 'bg-rose-50/50',
    badge: 'bg-rose-600 text-white border-rose-700',
    label: 'CRITICAL',
  },
  P2: {
    border: 'border-orange-300',
    bg: 'bg-orange-50/40',
    badge: 'bg-orange-500 text-white border-orange-600',
    label: 'HIGH',
  },
  P3: {
    border: 'border-amber-300',
    bg: 'bg-amber-50/35',
    badge: 'bg-amber-500 text-white border-amber-600',
    label: 'MEDIUM',
  },
  P4: {
    border: 'border-sky-300',
    bg: 'bg-sky-50/35',
    badge: 'bg-sky-600 text-white border-sky-700',
    label: 'LOW',
  },
};

function formatTimeAgo(iso: string): string {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hrs = Math.floor(diffMin / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  notifications,
  unreadCount,
  onMarkAsRead,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpandedCenter, setIsExpandedCenter] = useState(false);
  const [activeTab, setActiveTab] = useState<'alerts' | 'mail'>('alerts');
  const [userSwitchedTab, setUserSwitchedTab] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AlertFilterKey>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [prioritizedAlerts, setPrioritizedAlerts] = useState<PrioritizedAlertItem[]>([]);
  const [summary, setSummary] = useState<PrioritizedAlertsSummary | null>(null);
  const [lifecycleLoadingId, setLifecycleLoadingId] = useState<string | null>(null);
  const [confirmResolveId, setConfirmResolveId] = useState<string | null>(null);
  const [resolveNoteById, setResolveNoteById] = useState<Record<string, string>>({});

  const fetchPrioritizedAlerts = useCallback(
    async (filter: AlertFilterKey) => {
      setAlertsLoading(true);
      try {
        const res = await notificationsService.getPrioritizedAlerts(filter);
        const list = res.alerts || [];
        setPrioritizedAlerts(list);
        setSummary(res.summary || null);
        if (!userSwitchedTab && list.length === 0 && notifications.length > 0) {
          setActiveTab('mail');
        } else if (!userSwitchedTab && list.length > 0) {
          setActiveTab('alerts');
        }
      } catch {
        if (!userSwitchedTab && notifications.length > 0) {
          setActiveTab('mail');
        }
      } finally {
        setAlertsLoading(false);
      }
    },
    [userSwitchedTab, notifications.length],
  );

  useEffect(() => {
    fetchPrioritizedAlerts(activeFilter);
  }, [fetchPrioritizedAlerts, activeFilter]);

  useEffect(() => {
    if (isOpen) {
      fetchPrioritizedAlerts(activeFilter);
    }
  }, [isOpen, activeFilter, fetchPrioritizedAlerts]);

  const filteredAlerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return prioritizedAlerts;
    return prioritizedAlerts.filter((a) => {
      const hay = [
        a.vehicleRegistration,
        a.driverName,
        a.category,
        a.location,
        a.title,
        a.description,
        a.priorityLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [prioritizedAlerts, searchQuery]);

  const handleMarkAsRead = async (id: string) => {
    setLoadingId(id);
    try {
      await onMarkAsRead(id);
      toast.success('Notification marked as read');
    } catch {
      toast.error('Failed to update notification');
    } finally {
      setLoadingId(null);
    }
  };

  const handleLifecycle = async (
    alertId: string,
    action: AlertLifecycleUpdateRequest['action'],
    note?: string,
  ) => {
    setLifecycleLoadingId(alertId);
    try {
      await notificationsService.updateAlertLifecycle(alertId, { action, note });
      toast.success(`Alert updated (${action.replace('_', ' ')})`);
      setConfirmResolveId(null);
      await fetchPrioritizedAlerts(activeFilter);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update alert');
    } finally {
      setLifecycleLoadingId(null);
    }
  };

  const handleViewOnMap = (alert: PrioritizedAlertItem) => {
    if (!alert.vehicleId) {
      toast.info('No vehicle coordinates linked to this alert');
      return;
    }
    useDashboardDataStore.getState().setSelectedVehicleId(alert.vehicleId);
    useMapCameraStore.getState().focusOnFleet(alert.vehicleId);
    setIsOpen(false);
    setIsExpandedCenter(false);
    toast.success(`Focused map on ${alert.vehicleRegistration || alert.vehicleId}`);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-status-critical" />;
      case 'system':
        return <BellRing className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-status-informational" />;
    }
  };

  const getPriorityIcon = (alert: PrioritizedAlertItem) => {
    if (alert.state === 'RESOLVED' || alert.state === 'DISMISSED') {
      return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
    }
    if (alert.priority === 'P1') return <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />;
    if (alert.priority === 'P2') return <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />;
    if (alert.priority === 'P3') return <Clock className="w-4 h-4 text-amber-600 shrink-0" />;
    return <Info className="w-4 h-4 text-sky-600 shrink-0" />;
  };

  const totalBadgeCount = Math.max(unreadCount, summary?.totalActive || 0);
  const criticalCount = summary?.criticalCount || 0;
  const highestPreview = summary?.highestPriorityAlert;
  const acknowledgedCount = Math.max(
    0,
    (summary?.totalActive || 0) - (summary?.unacknowledgedCount || 0),
  );

  const overlayContent = isOpen ? (
    <div
      className="fixed inset-0 z-[9998] flex justify-end overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Notifications and Priority Alert Center"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs transition-opacity"
        onClick={() => {
          setIsOpen(false);
          setIsExpandedCenter(false);
        }}
      />

      {/* Drawer or Expanded Alert Center Container */}
      <div
        className={`relative z-10 bg-white shadow-2xl flex flex-col min-h-0 ${
          isExpandedCenter
            ? 'm-auto w-[96vw] max-w-5xl h-[92vh] rounded-2xl border border-slate-300 overflow-hidden'
            : 'w-full sm:w-[600px] max-w-full h-screen border-l border-slate-300'
        }`}
      >
        {/* Fixed Header */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-5 h-5 text-navy shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {isExpandedCenter ? 'Admin Priority Alert Center' : 'Notifications & Mail'}
              </h2>
              {totalBadgeCount > 0 && (
                <Badge variant="warning" className="text-xs shrink-0">
                  {totalBadgeCount} active
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsExpandedCenter((prev) => !prev)}
                className="h-8 px-2.5 text-xs gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                {isExpandedCenter ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Compact Drawer</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>View All Alerts</span>
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsOpen(false);
                  setIsExpandedCenter(false);
                }}
                className="rounded-full text-slate-500 hover:text-slate-800"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUserSwitchedTab(true);
                setActiveTab('alerts');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'alerts'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Priority Alerts ({summary?.totalActive ?? prioritizedAlerts.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setUserSwitchedTab(true);
                setActiveTab('mail');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'mail'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              Mail &amp; System ({notifications.length})
            </button>
          </div>

          {/* Summary Cards + Search + Filters (Priority Alerts tab) */}
          {activeTab === 'alerts' && (
            <div className="space-y-2.5">
              {summary && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[11px]">
                  <div className="bg-white border border-slate-200 rounded-lg p-1.5">
                    <div className="text-slate-500 text-[10px] font-medium">Total Active</div>
                    <div className="font-bold text-slate-900 font-mono text-sm">{summary.totalActive}</div>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-1.5">
                    <div className="text-rose-700 text-[10px] font-semibold">Critical</div>
                    <div className="font-bold text-rose-800 font-mono text-sm">{summary.criticalCount}</div>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-1.5">
                    <div className="text-orange-700 text-[10px] font-semibold">High</div>
                    <div className="font-bold text-orange-800 font-mono text-sm">{summary.highCount}</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-1.5">
                    <div className="text-amber-700 text-[10px] font-semibold">Medium</div>
                    <div className="font-bold text-amber-800 font-mono text-sm">{summary.mediumCount}</div>
                  </div>
                  <div className="bg-slate-100 border border-slate-200 rounded-lg p-1.5">
                    <div className="text-slate-600 text-[10px] font-semibold">Acked</div>
                    <div className="font-bold text-slate-800 font-mono text-sm">{acknowledgedCount}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-1.5">
                    <div className="text-emerald-700 text-[10px] font-semibold">Resolved</div>
                    <div className="font-bold text-emerald-800 font-mono text-sm">{summary.resolvedCount}</div>
                  </div>
                </div>
              )}

              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by vehicle, driver, location, category, or description..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Wrapping Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {(
                  [
                    ['active', 'Prioritized Active'],
                    ['all', 'All'],
                    ['P1', 'Critical'],
                    ['P2', 'High'],
                    ['P3', 'Medium'],
                    ['P4', 'Low'],
                    ['unacknowledged', 'Unacknowledged'],
                    ['acknowledged', 'Acknowledged'],
                    ['resolved', 'Resolved'],
                  ] as [AlertFilterKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveFilter(key)}
                    className={`px-2.5 py-1 rounded-md border transition cursor-pointer ${
                      activeFilter === key
                        ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content Area (min-h-0 ensures full flex height without clipping) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/40">
          {activeTab === 'alerts' ? (
            alertsLoading && filteredAlerts.length === 0 ? (
              <div className="text-center py-12 text-xs text-slate-500">
                Ranking fleet incidents by priority...
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500/60" />
                <p className="font-semibold text-slate-700 text-sm">No matching alerts</p>
                <p className="text-xs text-slate-400 mt-1">
                  Try clearing your search or switching the filter above.
                </p>
              </div>
            ) : (
              filteredAlerts.map((alert) => {
                const isResolved = alert.state === 'RESOLVED' || alert.state === 'DISMISSED';
                const style = isResolved
                  ? {
                      border: 'border-emerald-300',
                      bg: 'bg-emerald-50/35',
                      badge: 'bg-emerald-600 text-white border-emerald-700',
                      label: 'RESOLVED',
                    }
                  : PRIORITY_STYLE[alert.priority] || PRIORITY_STYLE.P4;

                return (
                  <article
                    key={alert.id}
                    data-testid={`priority-alert-${alert.priority}`}
                    className={`shrink-0 p-4 rounded-xl border-2 bg-white shadow-xs space-y-3 ${style.border}`}
                  >
                    {/* 1. TOP SECTION: Severity, Category/Title, Status, Timestamp */}
                    <div className={`-mx-4 -mt-4 px-4 py-2.5 rounded-t-[10px] border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 ${style.bg}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {getPriorityIcon(alert)}
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded border ${style.badge}`}>
                          {alert.priority} • {style.label}
                        </span>
                        <span className="text-[11px] uppercase font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {alert.category}
                        </span>
                        {alert.isSafetyCritical && !isResolved && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            IMMEDIATE SAFETY RISK
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-white border border-slate-300 font-semibold text-slate-800">
                          {alert.state}
                        </span>
                        <span className="text-slate-500">
                          {formatTimeAgo(alert.detectedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug break-words">
                        {alert.title}
                      </h3>
                      <p className="text-xs text-slate-700 leading-relaxed break-words">
                        {alert.description}
                      </p>
                    </div>

                    {/* 2. MAIN SECTION: Vehicle, Driver, Location, Source, Confidence */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-xs">
                      {alert.vehicleRegistration && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="text-slate-500">Vehicle:</span>
                          <span className="font-mono font-bold text-slate-900 break-all">
                            {alert.vehicleRegistration}
                          </span>
                        </div>
                      )}
                      {alert.driverName && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-500">Driver:</span>
                          <span className="font-semibold text-slate-800 break-words">
                            {alert.driverName}
                          </span>
                        </div>
                      )}
                      {alert.location && (
                        <div className="flex items-start gap-1.5 sm:col-span-2 min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-slate-500">Location: </span>
                            <span className="font-medium text-slate-800 break-words">
                              {alert.location}
                            </span>
                            {alert.coordinates && (
                              <span className="ml-1.5 font-mono text-[11px] text-slate-500">
                                ({alert.coordinates.lat.toFixed(4)}, {alert.coordinates.lng.toFixed(4)})
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="sm:col-span-2 text-[11px] text-slate-600 break-words">
                        <span className="font-semibold text-slate-700">Evidence &amp; Source: </span>
                        {alert.evidence} • Detected {new Date(alert.detectedAt).toLocaleString()}
                      </div>
                    </div>

                    {/* 3. IMPACT SECTION */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-white border border-slate-200 rounded-lg p-2.5">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                          Expected Delay
                        </span>
                        <span className="font-bold text-slate-900 font-mono">
                          {alert.estimatedDelayMinutes ? `+${alert.estimatedDelayMinutes} min` : 'Monitoring'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                          Time to Impact
                        </span>
                        <span className="font-bold text-slate-900 font-mono">
                          {alert.timeToImpactMinutes !== null && alert.timeToImpactMinutes !== undefined
                            ? alert.timeToImpactMinutes === 0
                              ? 'Immediate'
                              : `${alert.timeToImpactMinutes} min`
                            : 'Ongoing'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                          Priority Score
                        </span>
                        <span className="font-bold text-slate-900 font-mono">
                          {alert.priorityScore}/100 ({alert.confidencePct}% conf)
                        </span>
                      </div>
                      <div className="sm:col-span-3 text-[11px] text-slate-700 border-t border-slate-100 pt-1.5 break-words">
                        <span className="font-semibold text-slate-800">Operational Impact: </span>
                        {alert.predictedImpact}
                      </div>
                    </div>

                    {/* 4. ACTION SECTION */}
                    <div className="bg-blue-50/50 border border-blue-200/80 rounded-lg p-3 space-y-2.5">
                      <div className="text-xs text-slate-800 break-words">
                        <span className="font-bold text-blue-800">Recommended Action: </span>
                        {alert.recommendedAction}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isResolved && alert.state === 'NEW' && (
                          <button
                            type="button"
                            disabled={lifecycleLoadingId === alert.id}
                            onClick={() => handleLifecycle(alert.id, 'acknowledge')}
                            className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 cursor-pointer"
                          >
                            Acknowledge
                          </button>
                        )}
                        {!isResolved && alert.state !== 'ACTION_IN_PROGRESS' && (
                          <button
                            type="button"
                            disabled={lifecycleLoadingId === alert.id}
                            onClick={() => handleLifecycle(alert.id, 'in_progress')}
                            className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            Investigate
                          </button>
                        )}
                        {!isResolved && confirmResolveId !== alert.id && (
                          <button
                            type="button"
                            disabled={lifecycleLoadingId === alert.id}
                            onClick={() => setConfirmResolveId(alert.id)}
                            className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Resolve
                          </button>
                        )}
                        {alert.vehicleId && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleViewOnMap(alert)}
                              className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Navigation className="w-3.5 h-3.5 text-blue-600" />
                              View on Map
                            </button>
                            <a
                              href={`/fleet-twin/vehicles/${alert.vehicleId}`}
                              className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-blue-700 inline-flex items-center gap-1"
                            >
                              View Vehicle <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>

                      {/* Resolve Confirmation Box */}
                      {!isResolved && confirmResolveId === alert.id && (
                        <div className="p-2.5 bg-white border border-emerald-300 rounded-lg space-y-2">
                          <div className="text-[11px] font-semibold text-emerald-900">
                            Confirm incident resolution (optional resolution note):
                          </div>
                          <input
                            type="text"
                            value={resolveNoteById[alert.id] || ''}
                            onChange={(e) =>
                              setResolveNoteById((prev) => ({ ...prev, [alert.id]: e.target.value }))
                            }
                            placeholder="e.g., Rerouted via NH-75 / driver safely rested"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded text-slate-900"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={lifecycleLoadingId === alert.id}
                              onClick={() =>
                                handleLifecycle(
                                  alert.id,
                                  'resolve',
                                  resolveNoteById[alert.id] || 'Verified and resolved by operator',
                                )
                              }
                              className="px-3 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                            >
                              Confirm Resolve
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmResolveId(null)}
                              className="px-3 py-1 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action History */}
                    {alert.actionHistory.length > 0 && (
                      <div className="text-[11px] text-slate-500 font-mono border-t border-slate-200/70 pt-2 break-words">
                        Last action: {alert.actionHistory[0].action} by {alert.actionHistory[0].actorName} (
                        {new Date(alert.actionHistory[0].timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        ){alert.actionHistory[0].note ? ` — ${alert.actionHistory[0].note}` : ''}
                      </div>
                    )}
                  </article>
                );
              })
            )
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-slate-600">No notifications yet</p>
              <p className="text-xs text-slate-400 mt-1">
                System messages and division alerts will appear here.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className={`shrink-0 p-4 rounded-xl border transition-all ${
                  item.readAt
                    ? 'bg-slate-50/60 border-slate-300 opacity-85'
                    : 'bg-white border-slate-800 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(item.type)}
                    <span className="font-bold text-sm text-slate-900">{item.title}</span>
                  </div>
                  {!item.readAt && (
                    <span className="w-2 h-2 rounded-full bg-status-informational flex-shrink-0 mt-1" />
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-3 break-words">{item.body}</p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                  <span className="text-slate-400 font-mono">
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>

                  <div className="flex items-center gap-2">
                    {item.actionLabel && item.actionUrl && (
                      <a
                        href={item.actionUrl}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-semibold"
                      >
                        <span>{item.actionLabel}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    {!item.readAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMarkAsRead(item.id)}
                        disabled={loadingId === item.id}
                        className="h-7 px-2 text-xs gap-1 border-slate-200 hover:bg-slate-100 text-slate-700"
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{loadingId === item.id ? 'Marking...' : 'Mark read'}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Fixed Footer */}
        <div className="shrink-0 px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Priority Engine Active (P1–P4)</span>
          <span>NEXUS WAYS &bull; Alert Dispatcher</span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Bell Trigger Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="relative text-slate-600 hover:text-navy hover:bg-slate-100"
        aria-label="Open notifications"
        title={
          highestPreview
            ? `${criticalCount} critical • Highest: ${highestPreview.title}`
            : 'Open priority alerts & notifications'
        }
      >
        <Bell className="w-5 h-5" />
        {totalBadgeCount > 0 && (
          <span
            data-testid="unread-badge"
            className={`absolute -top-1 -right-1 flex h-5 min-w-5 px-1 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-white ${
              criticalCount > 0 ? 'bg-rose-600 animate-pulse' : 'bg-status-critical animate-pulse'
            }`}
          >
            {totalBadgeCount > 99 ? '99+' : totalBadgeCount}
          </span>
        )}
      </Button>

      {typeof document !== 'undefined' && overlayContent
        ? createPortal(overlayContent, document.body)
        : overlayContent}
    </>
  );
};
