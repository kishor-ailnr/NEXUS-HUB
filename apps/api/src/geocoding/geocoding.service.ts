import { Injectable, Logger } from '@nestjs/common';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface ReverseGeocodeResult {
  formatted: string;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  country?: string;
  rawDisplayName?: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastRequestTime = 0;
  private readonly minIntervalMs = 1050; // 1 req/sec rate limit
  private readonly reverseCache = new Map<string, { result: ReverseGeocodeResult; timestamp: number }>();

  private static readonly KNOWN_LOGISTICS_HUBS: Record<string, Coordinates & { city: string; state: string }> = {
    coimbatore: { latitude: 11.0168, longitude: 76.9558, city: 'Coimbatore', state: 'Tamil Nadu' },
    chennai: { latitude: 13.0827, longitude: 80.2707, city: 'Chennai', state: 'Tamil Nadu' },
    madurai: { latitude: 9.9252, longitude: 78.1198, city: 'Madurai', state: 'Tamil Nadu' },
    salem: { latitude: 11.6643, longitude: 78.146, city: 'Salem', state: 'Tamil Nadu' },
    tiruppur: { latitude: 11.1085, longitude: 77.3411, city: 'Tiruppur', state: 'Tamil Nadu' },
    bengaluru: { latitude: 12.9716, longitude: 77.5946, city: 'Bengaluru', state: 'Karnataka' },
    bangalore: { latitude: 12.9716, longitude: 77.5946, city: 'Bengaluru', state: 'Karnataka' },
    mysore: { latitude: 12.2958, longitude: 76.6394, city: 'Mysuru', state: 'Karnataka' },
    mumbai: { latitude: 19.076, longitude: 72.8777, city: 'Mumbai', state: 'Maharashtra' },
    'gateway of india': { latitude: 18.922, longitude: 72.8347, city: 'Mumbai', state: 'Maharashtra' },
    jnpt: { latitude: 18.9499, longitude: 72.9515, city: 'Navi Mumbai', state: 'Maharashtra' },
    pune: { latitude: 18.5204, longitude: 73.8567, city: 'Pune', state: 'Maharashtra' },
    delhi: { latitude: 28.6139, longitude: 77.209, city: 'New Delhi', state: 'Delhi' },
    kolkata: { latitude: 22.5726, longitude: 88.3639, city: 'Kolkata', state: 'West Bengal' },
    hyderabad: { latitude: 17.385, longitude: 78.4867, city: 'Hyderabad', state: 'Telangana' },
    cochin: { latitude: 9.9312, longitude: 76.2673, city: 'Kochi', state: 'Kerala' },
    kochi: { latitude: 9.9312, longitude: 76.2673, city: 'Kochi', state: 'Kerala' },
    ahmedabad: { latitude: 23.0225, longitude: 72.5714, city: 'Ahmedabad', state: 'Gujarat' },
    surat: { latitude: 21.1702, longitude: 72.8311, city: 'Surat', state: 'Gujarat' },
    jaipur: { latitude: 26.9124, longitude: 75.7873, city: 'Jaipur', state: 'Rajasthan' },
    lucknow: { latitude: 26.8467, longitude: 80.9462, city: 'Lucknow', state: 'Uttar Pradesh' },
  };

  private getKnownHubCoordinates(query: string): Coordinates | null {
    const normalized = query.toLowerCase();
    for (const [key, coords] of Object.entries(GeocodingService.KNOWN_LOGISTICS_HUBS)) {
      if (normalized.includes(key)) {
        return coords;
      }
    }
    return null;
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  async geocodeAddress(addressQuery: string): Promise<Coordinates | null> {
    if (!addressQuery || !addressQuery.trim()) {
      return null;
    }

    try {
      await this.waitForRateLimit();

      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', addressQuery.trim());
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'NEXUS-WAYS-Platform/1.0 (contact: support@nexusways.com)',
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim geocoding HTTP error ${response.status}: ${response.statusText}`);
        return this.getKnownHubCoordinates(addressQuery);
      }

      const data = (await response.json()) as any[];
      if (!Array.isArray(data) || data.length === 0) {
        this.logger.log(`No coordinates found via Nominatim for query: "${addressQuery}", checking logistics hub index`);
        return this.getKnownHubCoordinates(addressQuery);
      }

      const firstResult = data[0];
      const latitude = parseFloat(firstResult.lat);
      const longitude = parseFloat(firstResult.lon);

      if (isNaN(latitude) || isNaN(longitude)) {
        return this.getKnownHubCoordinates(addressQuery);
      }

      return { latitude, longitude };
    } catch (error: any) {
      this.logger.warn(`Geocoding network error for "${addressQuery}": ${error.message}. Using logistics hub index fallback.`);
      return this.getKnownHubCoordinates(addressQuery);
    }
  }

  /**
   * Reverse geocodes latitude/longitude into human-readable locality, city, state, country.
   * Includes rate limiting, in-memory caching, Nominatim reverse API, and known hub fallback.
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult | null> {
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) {
      return null;
    }

    // 1. Check in-memory cache (keyed to ~100m grid)
    const cacheKey = `${latitude.toFixed(3)}_${longitude.toFixed(3)}`;
    const cached = this.reverseCache.get(cacheKey);
    const oneHourMs = 3600 * 1000;
    if (cached && Date.now() - cached.timestamp < oneHourMs) {
      return cached.result;
    }

    try {
      await this.waitForRateLimit();

      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('lat', latitude.toString());
      url.searchParams.set('lon', longitude.toString());
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('accept-language', 'en');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'NEXUS-WAYS-Platform/1.0 (contact: support@nexusways.com)',
          'Accept-Language': 'en',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Nominatim reverse geocoding HTTP error ${response.status}: ${response.statusText}`);
        return this.getNearestKnownHub(latitude, longitude);
      }

      const data = (await response.json()) as any;
      if (!data || !data.address) {
        return this.getNearestKnownHub(latitude, longitude);
      }

      const addr = data.address;
      const locality =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.suburb ||
        addr.neighbourhood ||
        addr.county ||
        addr.municipality ||
        '';
      const district = addr.state_district || addr.county || '';
      const state = addr.state || '';
      const country = addr.country || 'India';

      let formatted = '';
      if (locality && state) {
        formatted = `${locality}, ${state}`;
      } else if (locality && country) {
        formatted = `${locality}, ${country}`;
      } else if (state && country) {
        formatted = `${state}, ${country}`;
      } else if (data.display_name) {
        formatted = data.display_name.split(',').slice(0, 2).join(',').trim();
      } else {
        formatted = `${Math.abs(latitude).toFixed(3)}° ${latitude >= 0 ? 'N' : 'S'}, ${Math.abs(longitude).toFixed(3)}° ${longitude >= 0 ? 'E' : 'W'}`;
      }

      const result: ReverseGeocodeResult = {
        formatted,
        locality: locality || undefined,
        city: addr.city || addr.town || undefined,
        district: district || undefined,
        state: state || undefined,
        country: country || undefined,
        rawDisplayName: data.display_name || undefined,
      };

      this.reverseCache.set(cacheKey, { result, timestamp: Date.now() });
      return result;
    } catch (error: any) {
      this.logger.warn(`Reverse geocoding network error for (${latitude}, ${longitude}): ${error.message}. Using hub fallback.`);
      return this.getNearestKnownHub(latitude, longitude);
    }
  }

  private getNearestKnownHub(lat: number, lng: number): ReverseGeocodeResult {
    let closestHub: { city: string; state: string } | null = null;
    let minDistance = Infinity;

    for (const hub of Object.values(GeocodingService.KNOWN_LOGISTICS_HUBS)) {
      const dLat = (hub.latitude - lat) * 111;
      const dLng = (hub.longitude - lng) * 111 * Math.cos((lat * Math.PI) / 180);
      const distKm = Math.hypot(dLat, dLng);
      if (distKm < minDistance) {
        minDistance = distKm;
        closestHub = hub;
      }
    }

    if (closestHub && minDistance <= 65) {
      return {
        formatted: `${closestHub.city}, ${closestHub.state}`,
        city: closestHub.city,
        state: closestHub.state,
        country: 'India',
      };
    }

    return {
      formatted: `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`,
    };
  }
}
