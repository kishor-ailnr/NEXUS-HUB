import { Injectable, Logger } from '@nestjs/common';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastRequestTime = 0;
  private readonly minIntervalMs = 1050; // 1 req/sec rate limit

  private static readonly KNOWN_LOGISTICS_HUBS: Record<string, Coordinates> = {
    'gateway of india': { latitude: 18.922, longitude: 72.8347 },
    mumbai: { latitude: 19.076, longitude: 72.8777 },
    jnpt: { latitude: 18.9499, longitude: 72.9515 },
    pune: { latitude: 18.5204, longitude: 73.8567 },
    delhi: { latitude: 28.6139, longitude: 77.209 },
    chennai: { latitude: 13.0827, longitude: 80.2707 },
    kolkata: { latitude: 22.5726, longitude: 88.3639 },
    bengaluru: { latitude: 12.9716, longitude: 77.5946 },
    bangalore: { latitude: 12.9716, longitude: 77.5946 },
    hyderabad: { latitude: 17.385, longitude: 78.4867 },
    cochin: { latitude: 9.9312, longitude: 76.2673 },
    kochi: { latitude: 9.9312, longitude: 76.2673 },
    ahmedabad: { latitude: 23.0225, longitude: 72.5714 },
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
}
