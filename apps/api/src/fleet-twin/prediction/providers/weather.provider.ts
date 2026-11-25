import { Injectable, Logger } from '@nestjs/common';

export interface WeatherForecast {
  condition: 'clear' | 'rain' | 'heavy_rain' | 'fog' | 'heatwave' | 'cyclone_alert' | 'ghat_mist';
  temperatureC: number;
  precipitationMm: number;
  visibilityKm: number;
  speedReductionPct: number;
  description: string;
  provider?: string;
  dataFreshness?: 'live' | 'cached' | 'fallback_baseline';
  lastFetched?: string;
  confidencePct?: number;
}

export interface WeatherProvider {
  getWeatherForecast(
    lat: number,
    lng: number,
    timestamp: Date,
    severityMultiplier?: number,
  ): Promise<WeatherForecast>;
  getProviderStatus?(): { provider: string; status: 'live' | 'cached' | 'fallback_baseline'; lastFetched: string };
}

@Injectable()
export class MockWeatherProvider implements WeatherProvider {
  private lastQueried: string = new Date().toISOString();

  getProviderStatus() {
    return {
      provider: 'Climatological Historical Baseline',
      status: 'fallback_baseline' as const,
      lastFetched: this.lastQueried,
    };
  }

  async getWeatherForecast(
    lat: number,
    lng: number,
    timestamp: Date,
    severityMultiplier = 1.0,
  ): Promise<WeatherForecast> {
    this.lastQueried = new Date().toISOString();
    const hour = timestamp.getHours();
    const month = timestamp.getMonth(); // 0 = Jan, 6 = Jul (Monsoon)

    // Seeded pseudo-randomness based on location + date
    const hash = Math.sin(lat * 12.9898 + lng * 78.233 + timestamp.getDate()) * 43758.5453;
    const seed = hash - Math.floor(hash);

    // Ghat / Mountain regions (Western Ghats: lat 8-21, lng 73-77)
    const isWesternGhats = lat >= 9 && lat <= 19 && lng >= 73 && lng <= 77.5;
    // Northern Plains (Winter fog: Dec-Jan, Nov-Feb)
    const isNorthIndia = lat >= 25 && lat <= 32;

    if (isWesternGhats && (hour < 8 || hour > 18 || seed > 0.6)) {
      const red = Math.min(45, Math.round(25 * severityMultiplier));
      return {
        condition: 'ghat_mist',
        temperatureC: 19,
        precipitationMm: 4 * severityMultiplier,
        visibilityKm: 1.5,
        speedReductionPct: red,
        description: `Dense hill-fog and wet curves across ghat descent (${red}% speed reduction)`,
        provider: 'Climatological Historical Baseline',
        dataFreshness: 'fallback_baseline',
        lastFetched: this.lastQueried,
        confidencePct: 82,
      };
    }

    if (isNorthIndia && (month === 11 || month === 0) && (hour < 9 || hour > 21)) {
      const red = Math.min(50, Math.round(30 * severityMultiplier));
      return {
        condition: 'fog',
        temperatureC: 11,
        precipitationMm: 0,
        visibilityKm: 0.8,
        speedReductionPct: red,
        description: `Thick winter radiation fog with low visibility (${red}% speed reduction)`,
        provider: 'Climatological Historical Baseline',
        dataFreshness: 'fallback_baseline',
        lastFetched: this.lastQueried,
        confidencePct: 84,
      };
    }

    // Monsoon season (June - September)
    if (month >= 5 && month <= 8 && seed > 0.4) {
      const isHeavy = seed > 0.75 || severityMultiplier > 1.5;
      const red = isHeavy
        ? Math.min(50, Math.round(35 * severityMultiplier))
        : Math.min(30, Math.round(15 * severityMultiplier));
      return {
        condition: isHeavy ? 'heavy_rain' : 'rain',
        temperatureC: 27,
        precipitationMm: (isHeavy ? 35 : 12) * severityMultiplier,
        visibilityKm: isHeavy ? 2 : 5,
        speedReductionPct: red,
        description: isHeavy
          ? `Heavy torrential monsoon downpour on highway (${red}% speed reduction)`
          : `Moderate seasonal monsoon showers (${red}% speed reduction)`,
        provider: 'Climatological Historical Baseline',
        dataFreshness: 'fallback_baseline',
        lastFetched: this.lastQueried,
        confidencePct: 80,
      };
    }

    // Summer heatwave (April - June in Central/Northern India)
    if (month >= 3 && month <= 5 && hour >= 12 && hour <= 16 && lat > 18) {
      return {
        condition: 'heatwave',
        temperatureC: 43,
        precipitationMm: 0,
        visibilityKm: 10,
        speedReductionPct: 10,
        description: 'Extreme midday asphalt heat; tyre thermal checks advised (10% speed reduction)',
        provider: 'Climatological Historical Baseline',
        dataFreshness: 'fallback_baseline',
        lastFetched: this.lastQueried,
        confidencePct: 88,
      };
    }

    return {
      condition: 'clear',
      temperatureC: 29,
      precipitationMm: 0,
      visibilityKm: 10,
      speedReductionPct: 0,
      description: 'Clear weather conditions with dry highway pavement',
      provider: 'Climatological Historical Baseline',
      dataFreshness: 'fallback_baseline',
      lastFetched: this.lastQueried,
      confidencePct: 92,
    };
  }
}

/**
 * Open-Meteo Real-Time & Hourly Forecast Provider with in-memory caching and fallback.
 */
@Injectable()
export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly logger = new Logger(OpenMeteoWeatherProvider.name);
  private readonly fallback = new MockWeatherProvider();
  private readonly cache = new Map<string, { data: any; expiresAt: number }>();
  private lastFetchedTime: string = new Date().toISOString();
  private lastStatus: 'live' | 'cached' | 'fallback_baseline' = 'fallback_baseline';

  getProviderStatus() {
    return {
      provider: 'Open-Meteo Forecast API',
      status: this.lastStatus,
      lastFetched: this.lastFetchedTime,
    };
  }

  async getWeatherForecast(
    lat: number,
    lng: number,
    timestamp: Date,
    severityMultiplier = 1.0,
  ): Promise<WeatherForecast> {
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLng = Math.round(lng * 100) / 100;
    const cacheKey = `${roundedLat},${roundedLng}`;
    const nowMs = Date.now();

    let rawData: any = null;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > nowMs) {
      rawData = cached.data;
      this.lastStatus = 'cached';
    } else {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLng}&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,visibility,wind_speed_10m&forecast_days=3&timezone=auto`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          rawData = await res.json();
          this.cache.set(cacheKey, { data: rawData, expiresAt: nowMs + 15 * 60 * 1000 });
          this.lastFetchedTime = new Date().toISOString();
          this.lastStatus = 'live';
        }
      } catch (err: any) {
        this.logger.debug(`Open-Meteo network query failed for ${cacheKey}, using baseline: ${err.message}`);
      }
    }

    if (!rawData?.hourly?.time) {
      const fallbackResult = await this.fallback.getWeatherForecast(lat, lng, timestamp, severityMultiplier);
      this.lastStatus = 'fallback_baseline';
      return {
        ...fallbackResult,
        provider: 'Open-Meteo (Historical Baseline Fallback)',
        dataFreshness: 'fallback_baseline',
        lastFetched: this.lastFetchedTime,
      };
    }

    // Find closest hourly forecast slot
    const targetIsoHour = timestamp.toISOString().slice(0, 13) + ':00';
    let index = rawData.hourly.time.findIndex((t: string) => t.startsWith(targetIsoHour));
    if (index === -1) index = 0;

    const temp = rawData.hourly.temperature_2m?.[index] ?? 28;
    const precip = (rawData.hourly.precipitation?.[index] ?? 0) * severityMultiplier;
    const weatherCode = rawData.hourly.weather_code?.[index] ?? 0;
    const visibilityMeters = rawData.hourly.visibility?.[index] ?? 10000;
    const visibilityKm = Math.round((visibilityMeters / 1000) * 10) / 10;
    const windSpeed = rawData.hourly.wind_speed_10m?.[index] ?? 12;

    // Map WMO code to condition & speed reduction
    let condition: WeatherForecast['condition'] = 'clear';
    let speedReductionPct = 0;
    let description = 'Clear skies with dry pavement';

    if (weatherCode === 45 || weatherCode === 48 || visibilityKm < 1.5) {
      condition = 'fog';
      speedReductionPct = Math.min(50, Math.round(25 * severityMultiplier));
      description = `Low visibility radiation fog (${visibilityKm} km); commercial speed restricted`;
    } else if (weatherCode >= 95 || (windSpeed > 45 && precip > 25)) {
      condition = 'cyclone_alert';
      speedReductionPct = Math.min(60, Math.round(45 * severityMultiplier));
      description = `Severe squall and high-speed wind alert (${Math.round(windSpeed)} km/h, ${precip.toFixed(1)} mm/h)`;
    } else if (precip > 15 || weatherCode >= 65 || weatherCode === 82) {
      condition = 'heavy_rain';
      speedReductionPct = Math.min(50, Math.round(35 * severityMultiplier));
      description = `Torrential rainfall downpour (${precip.toFixed(1)} mm/h) with highway surface pooling`;
    } else if (precip > 1.5 || (weatherCode >= 51 && weatherCode <= 63) || weatherCode === 80 || weatherCode === 81) {
      condition = 'rain';
      speedReductionPct = Math.min(30, Math.round(15 * severityMultiplier));
      description = `Wet highway conditions and reduced tire traction (${precip.toFixed(1)} mm/h)`;
    } else if (temp > 42) {
      condition = 'heatwave';
      speedReductionPct = 10;
      description = `Asphalt thermal heatwave warning (${temp}°C); mandatory tire pressure telemetry checks`;
    }

    return {
      condition,
      temperatureC: Math.round(temp),
      precipitationMm: Math.round(precip * 10) / 10,
      visibilityKm,
      speedReductionPct,
      description,
      provider: 'Open-Meteo Forecast API',
      dataFreshness: this.lastStatus,
      lastFetched: this.lastFetchedTime,
      confidencePct: this.lastStatus === 'live' ? 92 : 85,
    };
  }
}


