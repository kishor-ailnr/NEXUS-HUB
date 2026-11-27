import { Injectable, Logger } from '@nestjs/common';
import {
  TrafficProvenance,
  UnifiedTrafficTelemetry,
  TrafficProviderDiagnostics,
} from '@nexus-ways/shared';

export interface TrafficStatus {
  congestionLevel: 'low' | 'moderate' | 'heavy' | 'gridlock';
  delayMinutes: number;
  averageSpeedKmh: number;
  description: string;
  provider?: string;
  dataFreshness?: 'live' | 'cached' | 'fallback_baseline';
  provenance?: TrafficProvenance;
  lastFetched?: string;
  freeFlowSpeedKmh?: number;
  confidencePct?: number;
  roadClosure?: boolean;
  functionalRoadClass?: string;
  roadSegment?: string;
  speedReductionPct?: number;
  errorMessage?: string;
}

export interface TrafficProvider {
  getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry: boolean,
    congestionMultiplier?: number,
  ): Promise<TrafficStatus>;
  getNormalizedTraffic?(
    vehicleId: string | undefined,
    lat: number,
    lng: number,
    isBypassOrCityEntry?: boolean,
    congestionMultiplier?: number,
  ): Promise<UnifiedTrafficTelemetry>;
  getDiagnostics?(): TrafficProviderDiagnostics;
  getProviderStatus?(): { provider: string; status: 'live' | 'cached' | 'fallback_baseline'; lastFetched: string };
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function formatFrcLabel(frc?: string): string {
  switch (frc) {
    case 'FRC0':
      return 'Expressway / Motorway (FRC0)';
    case 'FRC1':
      return 'Major National Highway (FRC1)';
    case 'FRC2':
      return 'Other Major Highway (FRC2)';
    case 'FRC3':
      return 'Secondary Arterial Road (FRC3)';
    case 'FRC4':
      return 'Local Connecting Road (FRC4)';
    default:
      return frc ? `Road Segment (${frc})` : 'Highway Corridor Segment';
  }
}

@Injectable()
export class MockTrafficProvider implements TrafficProvider {
  private lastQueried: string = new Date().toISOString();

  getProviderStatus() {
    return {
      provider: 'Corridor Historical Time-of-Day Baseline',
      status: 'fallback_baseline' as const,
      lastFetched: this.lastQueried,
    };
  }

  getDiagnostics(): TrafficProviderDiagnostics {
    return {
      provider: 'Corridor Historical Time-of-Day Baseline',
      status: 'DEGRADED',
      api_key_configured: false,
      last_success_at: null,
      last_failure_at: null,
      last_http_status: null,
      error_category: 'API_KEY_MISSING',
      response_latency_ms: null,
      data_freshness: 'BASELINE_FALLBACK',
      success_count: 0,
      failure_count: 0,
      cache_size: 0,
      cache_ttl_seconds: 0,
    };
  }

  async getNormalizedTraffic(
    vehicleId: string | undefined,
    lat: number,
    lng: number,
    isBypassOrCityEntry = false,
    congestionMultiplier = 1.0,
  ): Promise<UnifiedTrafficTelemetry> {
    const now = new Date();
    const st = await this.getTrafficStatus(lat, lng, now, isBypassOrCityEntry, congestionMultiplier);
    const freeFlow = st.freeFlowSpeedKmh || 75;
    const speedReduction = Math.max(
      0,
      Math.min(100, Math.round(((freeFlow - st.averageSpeedKmh) / freeFlow) * 100)),
    );
    return {
      vehicle_id: vehicleId,
      lat,
      lng,
      road_segment: st.roadSegment || 'Corridor Baseline Segment',
      functional_road_class: st.functionalRoadClass,
      current_speed_kmh: st.averageSpeedKmh,
      free_flow_speed_kmh: freeFlow,
      congestion_level: st.congestionLevel,
      speed_reduction_pct: speedReduction,
      estimated_delay_minutes: st.delayMinutes,
      road_closure: Boolean(st.roadClosure),
      confidence_pct: st.confidencePct ?? 82,
      data_source: st.provider || 'Corridor Historical Baseline',
      provenance: 'BASELINE_FALLBACK',
      observed_at: st.lastFetched || now.toISOString(),
      provider_status: 'DEGRADED',
    };
  }

  async getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry = false,
    congestionMultiplier = 1.0,
  ): Promise<TrafficStatus> {
    this.lastQueried = new Date().toISOString();
    const hour = timestamp.getHours();
    const day = timestamp.getDay();

    const isMorningRush = hour >= 8 && hour <= 10;
    const isEveningRush = hour >= 17 && hour <= 20;
    const isWeekend = day === 0 || day === 6;

    const seed = Math.abs(Math.sin(lat * 31.5 + lng * 17.2 + hour)) % 1;

    if (isBypassOrCityEntry) {
      if (isMorningRush || isEveningRush) {
        const delay = Math.round((25 + seed * 25) * congestionMultiplier);
        return {
          congestionLevel: delay > 35 ? 'gridlock' : 'heavy',
          delayMinutes: delay,
          averageSpeedKmh: Math.max(12, Math.round(18 / congestionMultiplier)),
          freeFlowSpeedKmh: 65,
          description: `Urban periphery ring-road bottleneck during peak commuting (${delay}m delay)`,
          provider: 'Corridor Historical Baseline',
          dataFreshness: 'fallback_baseline',
          provenance: 'BASELINE_FALLBACK',
          lastFetched: this.lastQueried,
          confidencePct: 84,
          roadClosure: false,
        };
      }
      if (isWeekend && hour >= 16 && hour <= 21) {
        const delay = Math.round((15 + seed * 15) * congestionMultiplier);
        return {
          congestionLevel: 'moderate',
          delayMinutes: delay,
          averageSpeedKmh: Math.max(20, Math.round(35 / congestionMultiplier)),
          freeFlowSpeedKmh: 65,
          description: `Weekend city exit passenger vehicle surge (${delay}m delay)`,
          provider: 'Corridor Historical Baseline',
          dataFreshness: 'fallback_baseline',
          provenance: 'BASELINE_FALLBACK',
          lastFetched: this.lastQueried,
          confidencePct: 82,
          roadClosure: false,
        };
      }
    }

    if (seed > 0.88) {
      const delay = Math.round((30 + seed * 30) * congestionMultiplier);
      return {
        congestionLevel: 'heavy',
        delayMinutes: delay,
        averageSpeedKmh: Math.max(15, Math.round(20 / congestionMultiplier)),
        freeFlowSpeedKmh: 75,
        description: `Unscheduled highway lane closure due to road surface maintenance (${delay}m delay)`,
        provider: 'Corridor Historical Baseline',
        dataFreshness: 'fallback_baseline',
        provenance: 'BASELINE_FALLBACK',
        lastFetched: this.lastQueried,
        confidencePct: 79,
        roadClosure: false,
      };
    }

    if (isMorningRush || isEveningRush) {
      const delay = Math.round((10 + seed * 10) * congestionMultiplier);
      return {
        congestionLevel: 'moderate',
        delayMinutes: delay,
        averageSpeedKmh: Math.max(30, Math.round(48 / congestionMultiplier)),
        freeFlowSpeedKmh: 75,
        description: `Dense inter-city corridor flow (${delay}m delay)`,
        provider: 'Corridor Historical Baseline',
        dataFreshness: 'fallback_baseline',
        provenance: 'BASELINE_FALLBACK',
        lastFetched: this.lastQueried,
        confidencePct: 86,
        roadClosure: false,
      };
    }

    return {
      congestionLevel: 'low',
      delayMinutes: 0,
      averageSpeedKmh: 68,
      freeFlowSpeedKmh: 75,
      description: 'Free-flowing multi-lane national expressway corridor',
      provider: 'Corridor Historical Baseline',
      dataFreshness: 'fallback_baseline',
      provenance: 'BASELINE_FALLBACK',
      lastFetched: this.lastQueried,
      confidencePct: 90,
      roadClosure: false,
    };
  }
}

/**
 * Centralized TomTom Traffic Provider with Flow Segment Data v4 integration,
 * intelligent coordinate-bucket caching, diagnostics, and baseline fallback.
 */
@Injectable()
export class TomTomTrafficProvider implements TrafficProvider {
  private readonly logger = new Logger(TomTomTrafficProvider.name);
  private readonly fallback = new MockTrafficProvider();
  private readonly cache = new Map<string, { data: any; fetchedAt: string; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<any>>();

  private lastFetchedTime: string = new Date().toISOString();
  private lastStatus: 'live' | 'cached' | 'fallback_baseline' = 'fallback_baseline';
  private lastProvenance: TrafficProvenance = 'BASELINE_FALLBACK';
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastHttpStatus: number | null = null;
  private errorCategory: string | null = null;
  private lastErrorMessage: string | null = null;
  private lastLatencyMs: number | null = null;
  private successCount = 0;
  private failureCount = 0;

  private getCacheTtlMs(): number {
    const envVal = Number(process.env.TOMTOM_CACHE_TTL_MS);
    return Number.isFinite(envVal) && envVal >= 5000 ? envVal : 120_000; // 2 min default
  }

  private getTimeoutMs(): number {
    const envVal = Number(process.env.TOMTOM_TIMEOUT_MS);
    return Number.isFinite(envVal) && envVal >= 500 ? envVal : 4000;
  }

  getProviderStatus() {
    const hasKey = Boolean(process.env.TOMTOM_API_KEY?.trim());
    return {
      provider: hasKey ? 'TomTom Traffic API' : 'Corridor Historical Baseline',
      status: this.lastStatus,
      lastFetched: this.lastFetchedTime,
    };
  }

  getDiagnostics(): TrafficProviderDiagnostics {
    const apiKeyConfigured = Boolean(process.env.TOMTOM_API_KEY?.trim());
    let status: 'CONNECTED' | 'DEGRADED' | 'FAILED' = 'DEGRADED';

    if (!apiKeyConfigured) {
      status = 'FAILED';
    } else if (this.successCount > 0 && (!this.lastFailureAt || (this.lastSuccessAt && this.lastSuccessAt >= this.lastFailureAt))) {
      status = 'CONNECTED';
    } else if (this.failureCount > 0 && this.successCount === 0) {
      status = 'FAILED';
    } else if (this.failureCount > 0) {
      status = 'DEGRADED';
    }

    return {
      provider: apiKeyConfigured ? 'TomTom Traffic API v4' : 'Corridor Historical Baseline',
      status,
      api_key_configured: apiKeyConfigured,
      last_success_at: this.lastSuccessAt,
      last_failure_at: this.lastFailureAt,
      last_http_status: this.lastHttpStatus,
      error_category: !apiKeyConfigured ? 'API_KEY_MISSING' : this.errorCategory,
      response_latency_ms: this.lastLatencyMs,
      data_freshness: this.lastProvenance,
      success_count: this.successCount,
      failure_count: this.failureCount,
      cache_size: this.cache.size,
      cache_ttl_seconds: Math.round(this.getCacheTtlMs() / 1000),
    };
  }

  async getNormalizedTraffic(
    vehicleId: string | undefined,
    lat: number,
    lng: number,
    isBypassOrCityEntry = false,
    congestionMultiplier = 1.0,
  ): Promise<UnifiedTrafficTelemetry> {
    const now = new Date();
    const st = await this.getTrafficStatus(lat, lng, now, isBypassOrCityEntry, congestionMultiplier);
    const freeFlow = st.freeFlowSpeedKmh || 70;
    const speedReduction =
      st.speedReductionPct !== undefined
        ? st.speedReductionPct
        : Math.max(0, Math.min(100, Math.round(((freeFlow - st.averageSpeedKmh) / freeFlow) * 100)));

    const diag = this.getDiagnostics();
    const staleAfter = new Date(
      new Date(st.lastFetched || now.toISOString()).getTime() + this.getCacheTtlMs(),
    ).toISOString();

    return {
      vehicle_id: vehicleId,
      lat,
      lng,
      road_segment: st.roadSegment || formatFrcLabel(st.functionalRoadClass),
      functional_road_class: st.functionalRoadClass,
      current_speed_kmh: st.averageSpeedKmh,
      free_flow_speed_kmh: freeFlow,
      congestion_level: st.congestionLevel,
      speed_reduction_pct: speedReduction,
      estimated_delay_minutes: st.delayMinutes,
      road_closure: Boolean(st.roadClosure),
      confidence_pct: st.confidencePct ?? 85,
      data_source: st.provider || 'TomTom Traffic API',
      provenance: st.provenance || 'BASELINE_FALLBACK',
      observed_at: st.lastFetched || now.toISOString(),
      stale_after: staleAfter,
      provider_status: st.provenance === 'LIVE_TOMTOM' || st.provenance === 'CACHED_TOMTOM' ? 'CONNECTED' : diag.status,
      error_message: st.errorMessage,
    };
  }

  async getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry = false,
    congestionMultiplier = 1.0,
  ): Promise<TrafficStatus> {
    if (!isValidCoordinate(lat, lng)) {
      this.failureCount++;
      this.lastFailureAt = new Date().toISOString();
      this.errorCategory = 'INVALID_COORDINATES';
      this.lastErrorMessage = `Invalid coordinates (${lat}, ${lng})`;
      this.logger.warn(`TomTom skipped: ${this.lastErrorMessage}`);
      const fb = await this.fallback.getTrafficStatus(12.97, 79.16, timestamp, isBypassOrCityEntry, congestionMultiplier);
      return {
        ...fb,
        provider: 'Corridor Historical Baseline',
        dataFreshness: 'fallback_baseline',
        provenance: 'BASELINE_FALLBACK',
        errorMessage: this.lastErrorMessage,
      };
    }

    const apiKey = process.env.TOMTOM_API_KEY?.trim();
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLng = Math.round(lng * 100) / 100;
    const cacheKey = `${roundedLat},${roundedLng}`;
    const nowMs = Date.now();

    if (apiKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > nowMs) {
        this.lastStatus = 'cached';
        this.lastProvenance = 'CACHED_TOMTOM';
        this.lastFetchedTime = cached.fetchedAt;
        return this.parseTomTomResponse(cached.data, congestionMultiplier, 'cached', cached.fetchedAt);
      }

      try {
        // Deduplicate concurrent identical requests for the same coordinate bucket
        let pendingReq = this.inFlight.get(cacheKey);
        if (!pendingReq) {
          pendingReq = this.fetchTomTomFlow(roundedLat, roundedLng, apiKey);
          this.inFlight.set(cacheKey, pendingReq);
        }

        let data: any;
        try {
          data = await pendingReq;
        } finally {
          this.inFlight.delete(cacheKey);
        }

        const fetchedAt = new Date().toISOString();
        this.cache.set(cacheKey, { data, fetchedAt, expiresAt: Date.now() + this.getCacheTtlMs() });
        this.lastFetchedTime = fetchedAt;
        this.lastStatus = 'live';
        this.lastProvenance = 'LIVE_TOMTOM';
        return this.parseTomTomResponse(data, congestionMultiplier, 'live', fetchedAt);
      } catch (err: any) {
        this.logger.warn(
          `TomTom API fallback triggered at (${roundedLat}, ${roundedLng}) [${this.errorCategory || 'UNKNOWN'}]: ${err.message}`,
        );
      }
    } else {
      this.errorCategory = 'API_KEY_MISSING';
    }

    // Baseline fallback (explicitly labeled, never disguised as live TomTom)
    const result = await this.fallback.getTrafficStatus(
      lat,
      lng,
      timestamp,
      isBypassOrCityEntry,
      congestionMultiplier,
    );
    this.lastStatus = 'fallback_baseline';
    this.lastProvenance = 'BASELINE_FALLBACK';
    const fallbackNow = new Date().toISOString();
    this.lastFetchedTime = fallbackNow;
    return {
      ...result,
      provider: apiKey ? 'Corridor Baseline (TomTom Unavailable)' : 'Corridor Historical Baseline',
      dataFreshness: 'fallback_baseline',
      provenance: 'BASELINE_FALLBACK',
      lastFetched: fallbackNow,
      errorMessage: this.lastErrorMessage || undefined,
    };
  }

  private async fetchTomTomFlow(lat: number, lng: number, apiKey: string): Promise<any> {
    const startMs = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${lat},${lng}&unit=KMPH&key=${apiKey}`;
      const res = await fetch(url, { signal: controller.signal });
      this.lastLatencyMs = Date.now() - startMs;
      this.lastHttpStatus = res.status;

      if (!res.ok) {
        this.failureCount++;
        this.lastFailureAt = new Date().toISOString();
        if (res.status === 401 || res.status === 403) this.errorCategory = 'AUTH_ERROR';
        else if (res.status === 429) this.errorCategory = 'RATE_LIMIT';
        else if (res.status === 400) this.errorCategory = 'BAD_REQUEST';
        else this.errorCategory = 'HTTP_ERROR';
        this.lastErrorMessage = `TomTom HTTP ${res.status} (${this.errorCategory})`;
        throw new Error(this.lastErrorMessage);
      }

      const data = await res.json();
      if (!data?.flowSegmentData || typeof data.flowSegmentData.currentSpeed !== 'number') {
        this.failureCount++;
        this.lastFailureAt = new Date().toISOString();
        this.errorCategory = 'INVALID_RESPONSE';
        this.lastErrorMessage = 'TomTom response missing flowSegmentData.currentSpeed';
        throw new Error(this.lastErrorMessage);
      }

      this.successCount++;
      this.lastSuccessAt = new Date().toISOString();
      this.errorCategory = null;
      this.lastErrorMessage = null;
      return data;
    } catch (err: any) {
      this.lastLatencyMs = Date.now() - startMs;
      if (err?.name === 'AbortError') {
        this.failureCount++;
        this.lastFailureAt = new Date().toISOString();
        this.errorCategory = 'TIMEOUT';
        this.lastErrorMessage = `TomTom request timed out after ${this.getTimeoutMs()}ms`;
        throw new Error(this.lastErrorMessage);
      }
      if (!this.errorCategory || err?.message !== this.lastErrorMessage) {
        this.failureCount++;
        this.lastFailureAt = new Date().toISOString();
        this.errorCategory = 'NETWORK_ERROR';
        this.lastErrorMessage = err?.message || 'TomTom network error';
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseTomTomResponse(
    data: any,
    multiplier: number,
    freshness: 'live' | 'cached',
    fetchedAt: string,
  ): TrafficStatus {
    const flow = data?.flowSegmentData;
    const currentSpeed = Number(flow?.currentSpeed ?? 60);
    const freeFlowSpeed = Number(flow?.freeFlowSpeed ?? 75);
    const travelTime = Number(flow?.currentTravelTime ?? 60);
    const freeFlowTravelTime = Number(flow?.freeFlowTravelTime ?? 50);
    const roadClosure = Boolean(flow?.roadClosure);
    const frc = flow?.frc ? String(flow.frc) : undefined;
    const rawConf = typeof flow?.confidence === 'number' ? flow.confidence : 0.94;
    const confidencePct = rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);

    const delaySec = Math.max(0, travelTime - freeFlowTravelTime) * multiplier;
    const delayMinutes = Math.round(delaySec / 60);
    const speedReductionPct =
      freeFlowSpeed > 0
        ? Math.max(0, Math.min(100, Math.round(((freeFlowSpeed - currentSpeed) / freeFlowSpeed) * 100)))
        : 0;

    let congestionLevel: TrafficStatus['congestionLevel'] = 'low';
    const speedRatio = currentSpeed / (freeFlowSpeed || 1);
    if (roadClosure || speedRatio < 0.4 || delayMinutes > 25) congestionLevel = 'gridlock';
    else if (speedRatio < 0.65 || delayMinutes > 12) congestionLevel = 'heavy';
    else if (speedRatio < 0.85 || delayMinutes > 4) congestionLevel = 'moderate';

    return {
      congestionLevel,
      delayMinutes,
      averageSpeedKmh: Math.round(currentSpeed),
      freeFlowSpeedKmh: Math.round(freeFlowSpeed),
      speedReductionPct,
      roadClosure,
      functionalRoadClass: frc,
      roadSegment: formatFrcLabel(frc),
      description: roadClosure
        ? `TomTom road closure detected on ${formatFrcLabel(frc)}`
        : `TomTom ${freshness} flow: ${Math.round(currentSpeed)} km/h (free-flow ${Math.round(freeFlowSpeed)} km/h)`,
      provider: 'TomTom Traffic API',
      dataFreshness: freshness,
      provenance: freshness === 'live' ? 'LIVE_TOMTOM' : 'CACHED_TOMTOM',
      lastFetched: fetchedAt,
      confidencePct,
    };
  }
}
