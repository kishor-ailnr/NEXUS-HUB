import { Injectable, Logger, Optional, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  AlertPriorityLevel,
  AlertPriorityLabel,
  AlertLifecycleState,
  AlertCategory,
  AlertActionHistoryEntry,
  PrioritizedAlertItem,
  PrioritizedAlertsSummary,
  AlertLifecycleUpdateRequest,
} from '@nexus-ways/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { FleetTwinService } from '../fleet-twin/fleet-twin.service';

export interface AlertScoringWeights {
  severity: number;
  urgency: number;
  safety: number;
  operationalImpact: number;
  deliveryImpact: number;
  escalationRisk: number;
  confidence: number;
}

export const DEFAULT_ALERT_SCORING_WEIGHTS: AlertScoringWeights = {
  severity: 0.25,
  urgency: 0.20,
  safety: 0.20,
  operationalImpact: 0.12,
  deliveryImpact: 0.10,
  escalationRisk: 0.08,
  confidence: 0.05,
};

export interface RawAlertInput {
  id: string;
  source: 'db_alert' | 'fleet_twin' | 'live_traffic';
  rawType: string;
  severity: string;
  message: string;
  vehicleId?: string;
  vehicleRegistration?: string;
  driverName?: string;
  location?: string;
  coordinates?: { lat: number; lng: number };
  detectedAt: string;
  hoursFromNow?: number;
  delayMinutes?: number;
  roadClosure?: boolean;
  confidencePct?: number;
  dataSource: string;
  dataFreshness: string;
  acknowledgedAt?: string | null;
}

interface LifecycleRecord {
  state: AlertLifecycleState;
  assignedTo?: string;
  resolutionNotes?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  actionHistory: AlertActionHistoryEntry[];
}

const PRIORITY_RANK: Record<AlertPriorityLevel, number> = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

const PRIORITY_LABEL: Record<AlertPriorityLevel, AlertPriorityLabel> = {
  P1: 'CRITICAL',
  P2: 'HIGH',
  P3: 'MEDIUM',
  P4: 'LOW',
};

@Injectable()
export class AlertPrioritizationService {
  private readonly logger = new Logger(AlertPrioritizationService.name);
  private readonly lifecycleStore = new Map<string, LifecycleRecord>();
  private weights: AlertScoringWeights = { ...DEFAULT_ALERT_SCORING_WEIGHTS };

  constructor(
    private readonly supabase: SupabaseService,
    @Optional() private readonly fleetTwinService?: FleetTwinService,
  ) {}

  setWeights(custom: Partial<AlertScoringWeights>) {
    this.weights = { ...this.weights, ...custom };
  }

  /**
   * Classify, score, deduplicate, and rank alerts across DB, Fleet Twin, and Live Traffic.
   */
  async getPrioritizedAlerts(
    orgId: string,
    userId: string,
    userRole: string,
    filter: string = 'active',
  ): Promise<{ alerts: PrioritizedAlertItem[]; summary: PrioritizedAlertsSummary }> {
    const rawInputs: RawAlertInput[] = [];

    // 1. Fetch persistent DB alerts
    try {
      const { data: dbAlerts } = await this.supabase.adminClient
        .from('alerts')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50);

      for (const a of dbAlerts || []) {
        rawInputs.push({
          id: a.id,
          source: 'db_alert',
          rawType: a.type || 'operational',
          severity: a.severity || 'medium',
          message: a.message || '',
          vehicleId: a.vehicle_id,
          detectedAt: a.created_at || new Date().toISOString(),
          acknowledgedAt: a.acknowledged_at,
          dataSource: 'NEXUS Operational DB',
          dataFreshness: 'LIVE_DB',
          confidencePct: 95,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to query DB alerts: ${err?.message}`);
    }

    // 2. Fetch Fleet Twin 48h prediction alerts + live TomTom traffic anomalies
    let driverVehicleIds: string[] | null = null;
    try {
      if (this.fleetTwinService?.isEnabled()) {
        const overview = await this.fleetTwinService.getOverview();
        const vehicleMap = new Map(overview.vehicles.map((v) => [v.id, v]));

        if (userRole === 'driver') {
          driverVehicleIds = await this.resolveDriverVehicleIds(orgId, userId, overview.vehicles);
        }

        // Prediction alerts from Fleet Twin
        (overview.alerts || []).forEach((a, idx) => {
          const v = vehicleMap.get(a.vehicle_id);
          rawInputs.push({
            id: `twin-alert-${a.vehicle_id}-${idx}`,
            source: 'fleet_twin',
            rawType: a.event_type,
            severity: a.severity,
            message: a.description,
            vehicleId: a.vehicle_id,
            vehicleRegistration: a.registration_number,
            driverName: v?.driver?.name,
            location: a.location_name,
            coordinates: v ? { lat: v.current_lat, lng: v.current_lng } : undefined,
            detectedAt: overview.timestamp || new Date().toISOString(),
            hoursFromNow: a.hours_from_now,
            delayMinutes: a.delay_minutes,
            confidencePct: 88,
            dataSource: 'Fleet Digital Twin 48h',
            dataFreshness: 'MODEL_PREDICTION',
          });
        });

        // Live TomTom traffic road closures / heavy / gridlock observations
        for (const v of overview.vehicles) {
          const lt = v.live_traffic;
          if (!lt) continue;
          if (lt.road_closure || lt.congestion_level === 'gridlock' || lt.congestion_level === 'heavy') {
            rawInputs.push({
              id: `traffic-alert-${v.id}`,
              source: 'live_traffic',
              rawType: lt.road_closure ? 'road_closure' : 'traffic',
              severity: lt.road_closure || lt.congestion_level === 'gridlock' ? 'critical' : 'high',
              message: lt.road_closure
                ? `Road closure detected on ${lt.road_segment || 'corridor'} (${lt.data_source})`
                : `${lt.congestion_level.toUpperCase()} traffic: ${lt.current_speed_kmh} km/h vs ${lt.free_flow_speed_kmh} km/h free-flow (${lt.speed_reduction_pct}% reduction)`,
              vehicleId: v.id,
              vehicleRegistration: v.registration_number,
              driverName: v.driver?.name,
              location: lt.road_segment || v.current_checkpoint_name || 'Active Corridor',
              coordinates: { lat: lt.lat, lng: lt.lng },
              detectedAt: lt.observed_at,
              hoursFromNow: 0,
              delayMinutes: lt.estimated_delay_minutes,
              roadClosure: lt.road_closure,
              confidencePct: lt.confidence_pct,
              dataSource: lt.data_source,
              dataFreshness: lt.provenance,
            });
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to collect Fleet Twin alerts: ${err?.message}`);
    }

    // 3. Role-based filtering for drivers
    const roleFiltered =
      userRole === 'driver' && driverVehicleIds
        ? rawInputs.filter((r) => r.vehicleId && driverVehicleIds!.includes(r.vehicleId))
        : userRole === 'driver'
        ? []
        : rawInputs;

    // 4. Normalize, classify, score, and deduplicate by incident fingerprint
    const prioritized = this.prioritizeAndDeduplicate(roleFiltered);

    // 5. Compute summary across all items (before view filter)
    const activeItems = prioritized.filter((a) => a.state !== 'RESOLVED' && a.state !== 'DISMISSED');
    const resolvedItems = prioritized.filter((a) => a.state === 'RESOLVED' || a.state === 'DISMISSED');

    const summary: PrioritizedAlertsSummary = {
      totalActive: activeItems.length,
      criticalCount: activeItems.filter((a) => a.priority === 'P1').length,
      highCount: activeItems.filter((a) => a.priority === 'P2').length,
      mediumCount: activeItems.filter((a) => a.priority === 'P3').length,
      lowCount: activeItems.filter((a) => a.priority === 'P4').length,
      resolvedCount: resolvedItems.length,
      unacknowledgedCount: activeItems.filter((a) => a.state === 'NEW').length,
      highestPriorityAlert: activeItems[0] || null,
    };

    // 6. Apply requested view filter
    const filtered = this.applyFilter(prioritized, filter);
    return { alerts: filtered, summary };
  }

  /**
   * Pure prioritization, scoring, deduplication, and deterministic sorting engine.
   */
  prioritizeAndDeduplicate(inputs: RawAlertInput[]): PrioritizedAlertItem[] {
    const byFingerprint = new Map<string, PrioritizedAlertItem>();

    for (const raw of inputs) {
      const category = this.classifyCategory(raw.rawType, raw.message);
      const locationKey = (raw.location || 'corridor').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
      const fingerprint = `${raw.vehicleId || 'org'}:${category}:${locationKey}`;

      const item = this.buildPrioritizedItem(raw, category, fingerprint);
      const existing = byFingerprint.get(fingerprint);

      if (!existing) {
        byFingerprint.set(fingerprint, item);
      } else {
        // Merge duplicate ongoing incident & escalate if the newer reading is more severe
        const mergedAffected = existing.affectedVehiclesCount + (raw.vehicleId && raw.vehicleId !== existing.vehicleId ? 1 : 0);
        const takeIncoming =
          PRIORITY_RANK[item.priority] < PRIORITY_RANK[existing.priority] ||
          (item.isSafetyCritical && !existing.isSafetyCritical) ||
          item.priorityScore > existing.priorityScore;

        const base = takeIncoming ? item : existing;
        const mergedDelay = Math.max(existing.estimatedDelayMinutes || 0, item.estimatedDelayMinutes || 0);
        byFingerprint.set(fingerprint, {
          ...base,
          affectedVehiclesCount: mergedAffected,
          estimatedDelayMinutes: mergedDelay,
          priorityScore: Math.min(100, Math.max(existing.priorityScore, item.priorityScore) + (mergedAffected > 1 ? 3 : 0)),
        });
      }
    }

    return this.sortAlerts(Array.from(byFingerprint.values()));
  }

  /**
   * Deterministic sorting:
   * 1. Unresolved before Resolved/Dismissed
   * 2. P1 Safety-Critical -> P1 Operational -> P2 -> P3 -> P4
   * 3. Higher priorityScore
   * 4. Shorter timeToImpactMinutes
   * 5. Higher affectedVehiclesCount
   * 6. Older unresolved detectedAt first
   */
  sortAlerts(alerts: PrioritizedAlertItem[]): PrioritizedAlertItem[] {
    return [...alerts].sort((a, b) => {
      const aDone = a.state === 'RESOLVED' || a.state === 'DISMISSED' ? 1 : 0;
      const bDone = b.state === 'RESOLVED' || b.state === 'DISMISSED' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rankDiff !== 0) return rankDiff;

      // Safety-critical override within the same priority tier (especially P1)
      if (a.isSafetyCritical !== b.isSafetyCritical) {
        return a.isSafetyCritical ? -1 : 1;
      }

      if (b.priorityScore !== a.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }

      const aTti = a.timeToImpactMinutes ?? 9999;
      const bTti = b.timeToImpactMinutes ?? 9999;
      if (aTti !== bTti) return aTti - bTti;

      if (b.affectedVehiclesCount !== a.affectedVehiclesCount) {
        return b.affectedVehiclesCount - a.affectedVehiclesCount;
      }

      return new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime();
    });
  }

  /**
   * Execute lifecycle transitions (acknowledge, in_progress, assign, resolve, dismiss).
   * Acknowledging NEVER auto-resolves.
   */
  async updateLifecycle(
    orgId: string,
    userId: string,
    userRole: string,
    userName: string,
    alertId: string,
    req: AlertLifecycleUpdateRequest,
  ): Promise<PrioritizedAlertItem> {
    if (!req?.action) {
      throw new BadRequestException('Lifecycle action is required');
    }

    if (userRole === 'driver' && ['assign', 'resolve', 'dismiss'].includes(req.action)) {
      throw new ForbiddenException('Drivers cannot assign, resolve, or dismiss fleet incidents');
    }

    const { alerts } = await this.getPrioritizedAlerts(orgId, userId, userRole, 'all');
    const target = alerts.find((a) => a.id === alertId || a.fingerprint === alertId);
    if (!target) {
      throw new NotFoundException(`Alert ${alertId} not found or unauthorized`);
    }

    const now = new Date().toISOString();
    const existing = this.lifecycleStore.get(target.fingerprint) || {
      state: target.state,
      actionHistory: [...target.actionHistory],
    };

    let nextState: AlertLifecycleState = existing.state;
    let acknowledgedAt = existing.acknowledgedAt || target.acknowledgedAt;
    let resolvedAt = existing.resolvedAt || target.resolvedAt;
    let assignedTo = existing.assignedTo;
    let resolutionNotes = existing.resolutionNotes;

    switch (req.action) {
      case 'acknowledge':
        if (existing.state === 'NEW') nextState = 'ACKNOWLEDGED';
        acknowledgedAt = acknowledgedAt || now;
        break;
      case 'in_progress':
        nextState = 'ACTION_IN_PROGRESS';
        acknowledgedAt = acknowledgedAt || now;
        break;
      case 'assign':
        if (!req.assignedTo) throw new BadRequestException('assignedTo is required');
        assignedTo = req.assignedTo;
        if (existing.state === 'NEW') nextState = 'ACKNOWLEDGED';
        break;
      case 'resolve':
        nextState = 'RESOLVED';
        resolvedAt = now;
        resolutionNotes = req.note || 'Incident resolved by operator';
        break;
      case 'dismiss':
        nextState = 'DISMISSED';
        resolvedAt = now;
        resolutionNotes = req.note || 'Dismissed by operator';
        break;
      default:
        throw new BadRequestException(`Unsupported lifecycle action: ${req.action}`);
    }

    const historyEntry: AlertActionHistoryEntry = {
      action: req.action.toUpperCase(),
      actorId: userId,
      actorName: userName || userRole,
      note: req.note || (req.assignedTo ? `Assigned to ${req.assignedTo}` : undefined),
      timestamp: now,
    };

    const updatedRecord: LifecycleRecord = {
      state: nextState,
      assignedTo,
      resolutionNotes,
      acknowledgedAt,
      resolvedAt,
      actionHistory: [historyEntry, ...existing.actionHistory],
    };

    this.lifecycleStore.set(target.fingerprint, updatedRecord);
    this.lifecycleStore.set(target.id, updatedRecord);

    // Sync persistent DB alerts when acknowledging or resolving
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (target.source === 'db_alert' && uuidRegex.test(target.id) && acknowledgedAt) {
      try {
        await this.supabase.adminClient
          .from('alerts')
          .update({ acknowledged_at: acknowledgedAt })
          .eq('org_id', orgId)
          .eq('id', target.id);
      } catch {
        // non-blocking
      }
    }

    return {
      ...target,
      state: updatedRecord.state,
      assignedTo: updatedRecord.assignedTo,
      resolutionNotes: updatedRecord.resolutionNotes,
      acknowledgedAt: updatedRecord.acknowledgedAt,
      resolvedAt: updatedRecord.resolvedAt,
      actionHistory: updatedRecord.actionHistory,
    };
  }

  private buildPrioritizedItem(
    raw: RawAlertInput,
    category: AlertCategory,
    fingerprint: string,
  ): PrioritizedAlertItem {
    const lower = `${raw.rawType} ${raw.message}`.toLowerCase();
    const delay = raw.delayMinutes ?? this.extractDelayFromText(raw.message);
    const tti = raw.hoursFromNow !== undefined ? Math.round(raw.hoursFromNow * 60) : null;

    // Classify P1 - P4 and Safety-Critical flag
    let priority: AlertPriorityLevel = 'P4';
    let isSafetyCritical = false;

    const hasSafetyKeyword =
      raw.roadClosure ||
      lower.includes('accident') ||
      lower.includes('emergency') ||
      lower.includes('breakdown') ||
      lower.includes('hos_violation') ||
      lower.includes('torrential') ||
      lower.includes('cyclone') ||
      lower.includes('flood') ||
      lower.includes('severe') ||
      lower.includes('dangerous') ||
      lower.includes('overspeed');

    if (raw.severity === 'critical' || hasSafetyKeyword) {
      priority = 'P1';
      isSafetyCritical =
        Boolean(raw.roadClosure) ||
        category === 'weather' ||
        category === 'hos' ||
        category === 'mechanical' ||
        lower.includes('accident') ||
        lower.includes('emergency') ||
        lower.includes('safety');
    } else if (
      raw.severity === 'high' ||
      delay >= 30 ||
      lower.includes('gridlock') ||
      lower.includes('heavy') ||
      lower.includes('fuel')
    ) {
      priority = 'P2';
      isSafetyCritical = category === 'hos';
    } else if (raw.severity === 'medium' || delay >= 10) {
      priority = 'P3';
    } else {
      priority = 'P4';
    }

    // Explainable component scores (0 - 100)
    const severityScore = priority === 'P1' ? 100 : priority === 'P2' ? 78 : priority === 'P3' ? 52 : 25;
    const urgencyScore = tti !== null ? Math.max(20, Math.min(100, Math.round(100 - tti / 4))) : 80;
    const safetyScore = isSafetyCritical ? 100 : category === 'traffic' ? 55 : 35;
    const operationalImpact = Math.min(100, 35 + delay * 1.1);
    const deliveryImpact = Math.min(100, 25 + delay * 1.4);
    const escalationRisk = priority === 'P1' ? 92 : priority === 'P2' ? 74 : 45;
    const confidence = raw.confidencePct ?? 85;

    const w = this.weights;
    const priorityScore = Math.round(
      severityScore * w.severity +
        urgencyScore * w.urgency +
        safetyScore * w.safety +
        operationalImpact * w.operationalImpact +
        deliveryImpact * w.deliveryImpact +
        escalationRisk * w.escalationRisk +
        confidence * w.confidence,
    );

    const saved = this.lifecycleStore.get(fingerprint) || this.lifecycleStore.get(raw.id);
    const initialState: AlertLifecycleState = saved
      ? saved.state
      : raw.acknowledgedAt
      ? 'ACKNOWLEDGED'
      : 'NEW';

    const { title, rootCause, predictedImpact, recommendedAction } = this.buildContextDetails(
      raw,
      category,
      priority,
      delay,
    );

    return {
      id: raw.id,
      fingerprint,
      source: raw.source,
      priority,
      priorityLabel: PRIORITY_LABEL[priority],
      isSafetyCritical,
      priorityScore,
      scoreBreakdown: {
        severity: Math.round(severityScore),
        urgency: Math.round(urgencyScore),
        safety: Math.round(safetyScore),
        operationalImpact: Math.round(operationalImpact),
        deliveryImpact: Math.round(deliveryImpact),
        escalationRisk: Math.round(escalationRisk),
        confidence: Math.round(confidence),
      },
      state: initialState,
      category,
      title,
      description: raw.message,
      evidence: `${raw.dataSource} (${raw.dataFreshness}) • Confidence ${confidence}%`,
      rootCause,
      predictedImpact,
      recommendedAction,
      vehicleId: raw.vehicleId,
      vehicleRegistration: raw.vehicleRegistration,
      driverName: raw.driverName,
      location: raw.location || 'Active Corridor',
      coordinates: raw.coordinates,
      detectedAt: raw.detectedAt,
      timeToImpactMinutes: tti,
      estimatedDelayMinutes: delay,
      affectedVehiclesCount: 1,
      dataSource: raw.dataSource,
      dataFreshness: raw.dataFreshness,
      confidencePct: confidence,
      assignedTo: saved?.assignedTo,
      resolutionNotes: saved?.resolutionNotes,
      acknowledgedAt: saved?.acknowledgedAt || raw.acknowledgedAt || undefined,
      resolvedAt: saved?.resolvedAt,
      actionHistory: saved?.actionHistory || [],
    };
  }

  private classifyCategory(rawType: string, message: string): AlertCategory {
    const t = `${rawType} ${message}`.toLowerCase();
    if (t.includes('weather') || t.includes('rain') || t.includes('storm') || t.includes('flood')) return 'weather';
    if (t.includes('traffic') || t.includes('congestion') || t.includes('gridlock') || t.includes('closure')) return 'traffic';
    if (t.includes('toll') || t.includes('plaza') || t.includes('fastag')) return 'toll';
    if (t.includes('hos') || t.includes('rest') || t.includes('fatigue') || t.includes('duty')) return 'hos';
    if (t.includes('breakdown') || t.includes('mechanical') || t.includes('engine') || t.includes('fuel')) return 'mechanical';
    if (t.includes('geofence') || t.includes('boundary')) return 'geofence';
    if (t.includes('eta') || t.includes('delay')) return 'eta';
    return 'operational';
  }

  private extractDelayFromText(msg: string): number {
    const m = msg.match(/\+?(\d+)\s*(?:m|min|minutes)\b/i);
    return m ? Number(m[1]) : 0;
  }

  private buildContextDetails(
    raw: RawAlertInput,
    category: AlertCategory,
    priority: AlertPriorityLevel,
    delay: number,
  ) {
    const reg = raw.vehicleRegistration ? `${raw.vehicleRegistration} — ` : '';
    switch (category) {
      case 'weather':
        return {
          title: `${reg}Severe Weather Corridor Hazard`,
          rootCause: 'Adverse weather forecast / precipitation intensity on upcoming corridor segment',
          predictedImpact: `Safety visibility risk and ~${delay || 15} min estimated schedule impact`,
          recommendedAction:
            priority === 'P1'
              ? 'Instruct driver to reduce speed or pull into a safe designated lay-by; evaluate alternate corridor.'
              : 'Monitor weather cell and warn driver of wet-road braking distance.',
        };
      case 'traffic':
        return {
          title: `${reg}${raw.roadClosure ? 'Road Closure' : 'Corridor Traffic Congestion'}`,
          rootCause: raw.roadClosure ? 'Active road closure reported on route segment' : 'Live traffic speed drop below free-flow',
          predictedImpact: `+${delay || 20} min transit delay on current corridor`,
          recommendedAction: 'Run Dynamic Reroute comparison (Fastest vs Balanced) and divert if time saved > 10m.',
        };
      case 'toll':
        return {
          title: `${reg}Toll Plaza Queue Congestion`,
          rootCause: 'Heavy commercial queue buildup at upcoming FASTag toll plaza',
          predictedImpact: `+${delay || 15} min toll waiting delay`,
          recommendedAction: 'Verify FASTag balance and evaluate bypass corridor feasibility.',
        };
      case 'hos':
        return {
          title: `${reg}Driver HOS / Mandatory Rest Compliance`,
          rootCause: 'Driver approaching or exceeding legal continuous driving / duty hours',
          predictedImpact: 'Regulatory safety risk and mandatory rest stop schedule adjustment',
          recommendedAction: 'Calculate remaining legal driving window and direct driver to nearest verified rest facility.',
        };
      case 'mechanical':
        return {
          title: `${reg}Vehicle Mechanical / Breakdown Risk`,
          rootCause: 'Critical mechanical or fuel telemetry anomaly reported',
          predictedImpact: 'Potential immobilization and high delivery disruption',
          recommendedAction: 'Notify fleet manager immediately, dispatch recovery support, and locate nearest service bay.',
        };
      default:
        return {
          title: `${reg}Operational Fleet Alert`,
          rootCause: raw.rawType.replace(/_/g, ' '),
          predictedImpact: delay > 0 ? `+${delay} min projected ETA impact` : 'Requires operator verification',
          recommendedAction: 'Review vehicle telemetry and Digital Twin timeline before taking corrective action.',
        };
    }
  }

  private applyFilter(alerts: PrioritizedAlertItem[], filter: string): PrioritizedAlertItem[] {
    switch (filter) {
      case 'all':
        return alerts;
      case 'P1':
      case 'critical':
        return alerts.filter((a) => a.priority === 'P1' && a.state !== 'RESOLVED' && a.state !== 'DISMISSED');
      case 'P2':
      case 'high':
        return alerts.filter((a) => a.priority === 'P2' && a.state !== 'RESOLVED' && a.state !== 'DISMISSED');
      case 'P3':
      case 'medium':
        return alerts.filter((a) => a.priority === 'P3' && a.state !== 'RESOLVED' && a.state !== 'DISMISSED');
      case 'P4':
      case 'low':
        return alerts.filter((a) => a.priority === 'P4' && a.state !== 'RESOLVED' && a.state !== 'DISMISSED');
      case 'unacknowledged':
        return alerts.filter((a) => a.state === 'NEW');
      case 'acknowledged':
        return alerts.filter((a) => a.state === 'ACKNOWLEDGED' || a.state === 'ACTION_IN_PROGRESS');
      case 'resolved':
        return alerts.filter((a) => a.state === 'RESOLVED' || a.state === 'DISMISSED');
      case 'active':
      default:
        return alerts.filter((a) => a.state !== 'RESOLVED' && a.state !== 'DISMISSED');
    }
  }

  private async resolveDriverVehicleIds(orgId: string, userId: string, vehicles: any[]): Promise<string[]> {
    const ids: string[] = [];
    try {
      const { data: driverRows } = await this.supabase.adminClient
        .from('drivers')
        .select('id, license_number')
        .eq('org_id', orgId)
        .eq('user_id', userId);
      const { data: userRow } = await this.supabase.adminClient
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      for (const v of vehicles) {
        const nameMatch =
          userRow?.full_name && v.driver?.name && v.driver.name.toLowerCase().includes(userRow.full_name.toLowerCase());
        const licMatch = (driverRows || []).some(
          (d: any) => d.license_number && v.driver?.license_number === d.license_number,
        );
        if (nameMatch || licMatch) ids.push(v.id);
      }
    } catch {
      // ignore
    }
    return ids;
  }
}
