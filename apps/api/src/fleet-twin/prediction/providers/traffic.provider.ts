import { Injectable, Logger } from '@nestjs/common';

export interface TrafficStatus {
  congestionLevel: 'low' | 'moderate' | 'heavy' | 'gridlock';
  delayMinutes: number;
  averageSpeedKmh: number;
  description: string;
  provider?: string;
  dataFreshness?: 'live' | 'cached' | 'fallback_baseline';
  lastFetched?: string;
  freeFlowSpeedKmh?: number;
  confidencePct?: number;
}

export interface TrafficProvider {
  getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry: boolean,
    congestionMultiplier?: number,
  ): Promise<TrafficStatus>;
  getProviderStatus?(): { provider: string; status: 'live' | 'cached' | 'fallback_baseline'; lastFetched: string };
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

  async getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry = false,
    congestionMultiplier = 1.0,
  ): Promise<TrafficStatus> {
    this.lastQueried = new Date().toISOString();
    const hour = timestamp.getHours();
    const day = timestamp.getDay(); // 0 = Sun, 6 = Sat

    // Rush hours: 8-11 AM and 5-8 PM
    const isMorningRush = hour >= 8 && hour <= 10;
    const isEveningRush = hour >= 17 && hour <= 20;
    const isWeekend = day === 0 || day === 6;

    // Pseudo-random variance from location
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
          lastFetched: this.lastQueried,
          confidencePct: 84,
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
          lastFetched: this.lastQueried,
          confidencePct: 82,
        };
      }
    }

    // Highway accident / maintenance sporadic occurrence
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
        lastFetched: this.lastQueried,
        confidencePct: 79,
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
        lastFetched: this.lastQueried,
        confidencePct: 86,
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
      lastFetched: this.lastQueried,
      confidencePct: 90,
    };
  }
}

/**
 * TomTom Traffic Provider with API integration, cache, and corridor baseline fallback.
 */
@Injectable()
export class TomTomTrafficProvider implements TrafficProvider {
  private readonly logger = new Logger(TomTomTrafficProvider.name);
  private readonly fallback = new MockTrafficProvider();
  private readonly cache = new Map<string, { data: any; expiresAt: number }>();
  private lastFetchedTime: string = new Date().toISOString();
  private lastStatus: 'live' | 'cached' | 'fallback_baseline' = 'fallback_baseline';

  getProviderStatus() {
    const hasKey = Boolean(process.env.TOMTOM_API_KEY);
    return {
      provider: hasKey ? 'TomTom Traffic API' : 'TomTom / Historical Corridor Baseline',
      status: this.lastStatus,
      lastFetched: this.lastFetchedTime,
    };
  }

  async getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry = false,
    congestionMultiplier = 1.0,
  ): Promise<TrafficStatus> {
    const apiKey = process.env.TOMTOM_API_KEY;
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLng = Math.round(lng * 100) / 100;
    const cacheKey = `${roundedLat},${roundedLng}`;
    const nowMs = Date.now();

    if (apiKey) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > nowMs) {
        this.lastStatus = 'cached';
        return this.parseTomTomResponse(cached.data, congestionMultiplier);
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?point=${roundedLat},${roundedLng}&unit=KMPH&key=${apiKey}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          this.cache.set(cacheKey, { data, expiresAt: nowMs + 5 * 60 * 1000 });
          this.lastFetchedTime = new Date().toISOString();
          this.lastStatus = 'live';
          return this.parseTomTomResponse(data, congestionMultiplier);
        }
      } catch (err: any) {
        this.logger.debug(`TomTom API query failed for ${cacheKey}, using corridor baseline: ${err.message}`);
      }
    }

    // Baseline fallback
    const result = await this.fallback.getTrafficStatus(
      lat,
      lng,
      timestamp,
      isBypassOrCityEntry,
      congestionMultiplier,
    );
    this.lastStatus = 'fallback_baseline';
    return {
      ...result,
      provider: apiKey ? 'TomTom Traffic (Baseline Fallback)' : 'Corridor Historical Baseline',
      dataFreshness: 'fallback_baseline',
      lastFetched: this.lastFetchedTime,
    };
  }

  private parseTomTomResponse(data: any, multiplier: number): TrafficStatus {
    const flow = data?.flowSegmentData;
    const currentSpeed = flow?.currentSpeed ?? 60;
    const freeFlowSpeed = flow?.freeFlowSpeed ?? 75;
    const travelTime = flow?.currentTravelTime ?? 60;
    const freeFlowTravelTime = flow?.freeFlowTravelTime ?? 50;

    const delaySec = Math.max(0, travelTime - freeFlowTravelTime) * multiplier;
    const delayMinutes = Math.round(delaySec / 60);

    let congestionLevel: TrafficStatus['congestionLevel'] = 'low';
    const speedRatio = currentSpeed / (freeFlowSpeed || 1);
    if (speedRatio < 0.4 || delayMinutes > 25) congestionLevel = 'gridlock';
    else if (speedRatio < 0.65 || delayMinutes > 12) congestionLevel = 'heavy';
    else if (speedRatio < 0.85 || delayMinutes > 4) congestionLevel = 'moderate';

    return {
      congestionLevel,
      delayMinutes,
      averageSpeedKmh: Math.round(currentSpeed),
      freeFlowSpeedKmh: Math.round(freeFlowSpeed),
      description: `Live TomTom flow observation: ${Math.round(currentSpeed)} km/h (free-flow ${Math.round(freeFlowSpeed)} km/h)`,
      provider: 'TomTom Traffic API',
      dataFreshness: this.lastStatus,
      lastFetched: this.lastFetchedTime,
      confidencePct: 94,
    };
  }
}


