import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  OsrmRouteGeometry,
  findOsrmCorridorByCities,
} from '@nexus-ways/shared';

export interface RouteWaypoint {
  lat: number;
  lng: number;
  label?: string;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Generates a cache key string from ordered waypoints rounded to 5 decimal places.
   */
  private generateCoordKey(waypoints: RouteWaypoint[]): string {
    return waypoints
      .map((w) => `${w.lng.toFixed(5)},${w.lat.toFixed(5)}`)
      .join(';');
  }

  /**
   * Calculate route distance and duration using haversine formula for straight-line fallback.
   * Clearly marked as FALLBACK_ROUTE with explicit failure reason.
   */
  private calculateHaversineFallback(
    waypoints: RouteWaypoint[],
    reason = 'OSRM service unavailable',
  ): OsrmRouteGeometry {
    const coordinates: [number, number][] = [];
    let totalDistKm = 0;

    for (let i = 0; i < waypoints.length; i++) {
      const current = waypoints[i];
      coordinates.push([current.lng, current.lat]);

      if (i < waypoints.length - 1) {
        const next = waypoints[i + 1];
        // Generate intermediate interpolation points (10 steps between waypoints)
        const steps = 10;
        for (let s = 1; s < steps; s++) {
          const frac = s / steps;
          const interpLng = current.lng + (next.lng - current.lng) * frac;
          const interpLat = current.lat + (next.lat - current.lat) * frac;
          coordinates.push([interpLng, interpLat]);
        }

        // Haversine distance
        const R = 6371; // Earth radius km
        const dLat = ((next.lat - current.lat) * Math.PI) / 180;
        const dLng = ((next.lng - current.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((current.lat * Math.PI) / 180) *
            Math.cos((next.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        totalDistKm += R * c;
      }
    }

    // Assume average speed 60 km/h for straight line estimation
    const durationMinutes = (totalDistKm / 60) * 60;

    this.logger.warn(`[ROUTING FALLBACK ACTIVATED] Reason: ${reason} for ${waypoints.length} waypoints.`);

    return {
      routing_source: 'fallback-straight-line',
      routing_status: 'FALLBACK_ROUTE',
      fallback_reason: reason,
      coordinates,
      distance_km: Math.round(totalDistKm * 100) / 100,
      duration_minutes: Math.round(durationMinutes),
    };
  }

  /**
   * Route calculation using OSRM with rigorous caching in saved_routes and verified highway fallbacks.
   */
  async getRoute(
    orgId: string,
    waypoints: RouteWaypoint[],
    originLabel?: string,
    destLabel?: string,
  ): Promise<OsrmRouteGeometry> {
    if (!waypoints || waypoints.length < 2) {
      throw new Error('At least origin and destination waypoints are required');
    }

    // Check precomputed verified OSRM highway corridors for standard Indian city pairs
    const verifiedCorridor =
      originLabel && destLabel ? findOsrmCorridorByCities(originLabel, destLabel) : null;

    // 1. Check database cache in saved_routes if origin & destination labels are provided
    if (orgId && originLabel && destLabel) {
      try {
        const { data: cached } = await this.supabase.adminClient
          .from('saved_routes')
          .select('osrm_geometry, usage_count')
          .eq('org_id', orgId)
          .eq('origin_label', originLabel)
          .eq('destination_label', destLabel)
          .maybeSingle();

        if (cached && cached.osrm_geometry && Array.isArray(cached.osrm_geometry.coordinates)) {
          const geom = cached.osrm_geometry as OsrmRouteGeometry;

          // Strict validation: Reject stale straight-line fallbacks and incomplete geometries from cache
          if (geom.routing_source === 'osrm' && geom.coordinates.length >= 2 && geom.distance_km > 0) {
            this.logger.log(
              `Using verified cached OSRM route for "${originLabel}" -> "${destLabel}" (${geom.coordinates.length} pts, ${geom.distance_km} km)`,
            );

            // Increment usage count asynchronously
            await this.supabase.adminClient
              .from('saved_routes')
              .update({
                usage_count: (cached.usage_count || 1) + 1,
                updated_at: new Date().toISOString(),
              })
              .eq('org_id', orgId)
              .eq('origin_label', originLabel)
              .eq('destination_label', destLabel);

            return {
              ...geom,
              routing_status: 'OSRM_SUCCESS',
            };
          } else {
            this.logger.warn(
              `Invalid or fallback cached route found for "${originLabel}" -> "${destLabel}" (${geom.routing_source}, ${geom.coordinates.length} pts). Invalidation triggered.`,
            );
          }
        }
      } catch (err: any) {
        this.logger.warn(`Cache lookup failed for saved route: ${err.message}`);
      }
    }

    // 2. Call real OSRM Driving Route API with GeoJSON road geometries
    const coordString = waypoints
      .map((w) => `${w.lng.toFixed(5)},${w.lat.toFixed(5)}`)
      .join(';');

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

    let lastError = 'OSRM request failed';
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(`Calling OSRM server (attempt ${attempt}/${maxAttempts}): ${osrmUrl}`);
        const response = await fetch(osrmUrl, {
          headers: {
            'User-Agent': 'NEXUS-WAYS-Platform/1.0',
          },
        });

        if (!response.ok) {
          lastError = `OSRM server returned HTTP ${response.status}: ${response.statusText}`;
          this.logger.warn(lastError);
          continue;
        }

        const json = (await response.json()) as any;
        if (json.code !== 'Ok' || !json.routes || json.routes.length === 0) {
          lastError = `OSRM returned code: ${json.code || 'no routes'}`;
          this.logger.warn(lastError);
          continue;
        }

        const route = json.routes[0];
        if (!route.geometry || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2) {
          lastError = 'OSRM returned invalid route coordinates';
          this.logger.warn(lastError);
          continue;
        }

        const distanceKm = Math.round((route.distance / 1000) * 100) / 100;
        const durationMinutes = Math.round(route.duration / 60);

        const result: OsrmRouteGeometry = {
          routing_source: 'osrm',
          routing_status: 'OSRM_SUCCESS',
          coordinates: route.geometry.coordinates as [number, number][],
          distance_km: distanceKm,
          duration_minutes: durationMinutes,
        };

        // Cache the verified OSRM result in saved_routes
        if (orgId && originLabel && destLabel) {
          try {
            const intermediateCheckpoints = waypoints.slice(1, -1).map((w) => ({
              label: w.label || 'Checkpoint',
              lat: w.lat,
              lng: w.lng,
            }));

            await this.supabase.adminClient
              .from('saved_routes')
              .upsert(
                {
                  org_id: orgId,
                  origin_label: originLabel,
                  destination_label: destLabel,
                  checkpoints: intermediateCheckpoints,
                  osrm_geometry: result,
                  usage_count: 1,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'org_id,origin_label,destination_label' },
              );
          } catch (saveErr: any) {
            this.logger.warn(`Failed to save route cache to saved_routes: ${saveErr.message}`);
          }
        }

        return result;
      } catch (error: any) {
        lastError = `OSRM network error: ${error.message}`;
        this.logger.warn(`Attempt ${attempt} failed: ${lastError}`);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }

    // 3. If OSRM is unreachable, use verified precomputed highway corridor before falling back to haversine
    if (verifiedCorridor) {
      this.logger.log(
        `OSRM server unavailable. Using verified highway road geometry for "${originLabel}" -> "${destLabel}" (${verifiedCorridor.coordinates.length} pts, ${verifiedCorridor.distance_km} km)`,
      );

      // Cache verified corridor into saved_routes if orgId & labels present
      if (orgId && originLabel && destLabel) {
        try {
          await this.supabase.adminClient.from('saved_routes').upsert(
            {
              org_id: orgId,
              origin_label: originLabel,
              destination_label: destLabel,
              checkpoints: waypoints.slice(1, -1).map((w) => ({ label: w.label || 'Checkpoint', lat: w.lat, lng: w.lng })),
              osrm_geometry: verifiedCorridor,
              usage_count: 1,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'org_id,origin_label,destination_label' },
          );
        } catch {
          // ignore cache error
        }
      }

      return verifiedCorridor;
    }

    // 4. Haversine straight-line fallback (explicitly flagged, never stored in saved_routes as osrm)
    return this.calculateHaversineFallback(waypoints, lastError);
  }

  /**
   * Computes a genuinely distinct road-network alternate route starting strictly from
   * (currentLat, currentLng) to (destLat, destLng) using OSRM alternatives & via-bypass.
   * Rejects duplicate routes (>80% overlap with primaryCoords) and never returns straight-line fallback.
   */
  async getDistinctAlternateRoute(
    currentLat: number,
    currentLng: number,
    destLat: number,
    destLng: number,
    viaLat: number,
    viaLng: number,
    primaryCoords: [number, number][] = [],
  ): Promise<OsrmRouteGeometry | null> {
    const isDuplicateOfPrimary = (altCoords: [number, number][]): boolean => {
      if (!primaryCoords || primaryCoords.length < 4 || altCoords.length < 4) return false;
      const sampleStep = Math.max(1, Math.floor(altCoords.length / 15));
      let closeCount = 0;
      let totalSampled = 0;
      for (let i = 0; i < altCoords.length; i += sampleStep) {
        totalSampled++;
        const [aLng, aLat] = altCoords[i];
        const near = primaryCoords.some((p) => {
          const pLat = p[0] > 50 && p[1] < 45 ? p[1] : p[0];
          const pLng = p[0] > 50 && p[1] < 45 ? p[0] : p[1];
          return Math.hypot(pLat - aLat, pLng - aLng) < 0.015;
        });
        if (near) closeCount++;
      }
      return totalSampled > 0 && closeCount / totalSampled > 0.8;
    };

    const urls = [
      `https://router.project-osrm.org/route/v1/driving/${currentLng.toFixed(5)},${currentLat.toFixed(5)};${destLng.toFixed(5)},${destLat.toFixed(5)}?overview=full&geometries=geojson&alternatives=true`,
      `https://router.project-osrm.org/route/v1/driving/${currentLng.toFixed(5)},${currentLat.toFixed(5)};${viaLng.toFixed(5)},${viaLat.toFixed(5)};${destLng.toFixed(5)},${destLat.toFixed(5)}?overview=full&geometries=geojson`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'NEXUS-WAYS-Platform/1.0' },
        });
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        if (json.code !== 'Ok' || !Array.isArray(json.routes) || json.routes.length === 0) {
          continue;
        }
        // If alternatives=true returned multiple routes, inspect index 1+ first, then 0
        const orderedRoutes =
          json.routes.length > 1 ? [...json.routes.slice(1), json.routes[0]] : json.routes;
        for (const r of orderedRoutes) {
          const coords = r?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2 && !isDuplicateOfPrimary(coords)) {
            return {
              routing_source: 'osrm',
              routing_status: 'OSRM_SUCCESS',
              coordinates: coords as [number, number][],
              distance_km: Math.round((r.distance / 1000) * 100) / 100,
              duration_minutes: Math.round(r.duration / 60),
            };
          }
        }
      } catch {
        // try next strategy
      }
    }
    return null;
  }
}
