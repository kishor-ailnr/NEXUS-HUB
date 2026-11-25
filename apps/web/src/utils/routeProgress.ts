/**
 * Geospatial Route Progress & Snapping Utility
 * 
 * Accurately snaps real-time vehicle GPS positions onto ordered OSRM road geometry
 * and cleanly splits the polyline into:
 *   1. Travelled route (rendered in vivid green)
 *   2. Remaining route (rendered in original theme color)
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface RouteProgressResult {
  snappedPosition: [number, number]; // [lat, lng]
  travelledCoordinates: [number, number][]; // [lat, lng][]
  remainingCoordinates: [number, number][]; // [lat, lng][]
  travelledDistanceKm: number;
  remainingDistanceKm: number;
  totalDistanceKm: number;
  progressPercent: number; // 0 to 100
  segmentIndex: number;
}

/**
 * Fast and accurate distance in meters between two lat/lng coordinates (Haversine formula)
 */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371000; // Earth radius in meters
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Projects point V onto line segment A -> B in local planar meters.
 * Returns the snapped lat/lng point, the projection fraction t in [0, 1], and the distance in meters from V to the line segment.
 */
export function projectPointOnSegment(
  vLat: number,
  vLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): { snapLat: number; snapLng: number; t: number; distanceMeters: number } {
  // Approximate conversion to meters relative to A
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const metersPerDegLat = 111132;
  const metersPerDegLng = 111412 * Math.cos(midLat);

  const dx = (bLng - aLng) * metersPerDegLng;
  const dy = (bLat - aLat) * metersPerDegLat;
  const segLenSq = dx * dx + dy * dy;

  if (segLenSq < 1e-4) {
    // Degenerate segment: A and B are effectively identical
    const dist = haversineMeters(vLat, vLng, aLat, aLng);
    return { snapLat: aLat, snapLng: aLng, t: 0, distanceMeters: dist };
  }

  const px = (vLng - aLng) * metersPerDegLng;
  const py = (vLat - aLat) * metersPerDegLat;

  let t = (px * dx + py * dy) / segLenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const snapLat = aLat + t * (bLat - aLat);
  const snapLng = aLng + t * (bLng - aLng);
  const dist = haversineMeters(vLat, vLng, snapLat, snapLng);

  return { snapLat, snapLng, t, distanceMeters: dist };
}

/**
 * Computes route progress and splits geometry into travelled (completed) and remaining (future) segments.
 * 
 * @param coordinates Array of route waypoints in [lat, lng] format
 * @param vehicleLat Vehicle's current latitude
 * @param vehicleLng Vehicle's current longitude
 * @param previousProgressKm Optional previously confirmed progress in km to apply monotonic smoothing
 */
export function calculateRouteProgress(
  coordinates: [number, number][],
  vehicleLat: number,
  vehicleLng: number,
  previousProgressKm = 0,
): RouteProgressResult {
  if (!coordinates || coordinates.length === 0) {
    const fallbackPoint: [number, number] = [vehicleLat, vehicleLng];
    return {
      snappedPosition: fallbackPoint,
      travelledCoordinates: [fallbackPoint],
      remainingCoordinates: [fallbackPoint],
      travelledDistanceKm: 0,
      remainingDistanceKm: 0,
      totalDistanceKm: 0,
      progressPercent: 0,
      segmentIndex: 0,
    };
  }

  if (coordinates.length === 1) {
    const pt = coordinates[0];
    return {
      snappedPosition: pt,
      travelledCoordinates: [pt],
      remainingCoordinates: [pt],
      travelledDistanceKm: 0,
      remainingDistanceKm: 0,
      totalDistanceKm: 0,
      progressPercent: 100,
      segmentIndex: 0,
    };
  }

  // 1. Calculate cumulative segment distances along route
  const numPoints = coordinates.length;
  const cumDistMeters: number[] = new Array(numPoints).fill(0);
  for (let i = 0; i < numPoints - 1; i++) {
    const d = haversineMeters(
      coordinates[i][0],
      coordinates[i][1],
      coordinates[i + 1][0],
      coordinates[i + 1][1],
    );
    cumDistMeters[i + 1] = cumDistMeters[i] + d;
  }
  const totalRouteMeters = cumDistMeters[numPoints - 1];
  const totalDistanceKm = totalRouteMeters / 1000;

  // 2. Find closest segment to vehicle's current position
  let bestSegIndex = 0;
  let minDistanceMeters = Infinity;
  let bestSnapLat = coordinates[0][0];
  let bestSnapLng = coordinates[0][1];
  let bestT = 0;

  for (let i = 0; i < numPoints - 1; i++) {
    const proj = projectPointOnSegment(
      vehicleLat,
      vehicleLng,
      coordinates[i][0],
      coordinates[i][1],
      coordinates[i + 1][0],
      coordinates[i + 1][1],
    );

    if (proj.distanceMeters < minDistanceMeters) {
      minDistanceMeters = proj.distanceMeters;
      bestSegIndex = i;
      bestSnapLat = proj.snapLat;
      bestSnapLng = proj.snapLng;
      bestT = proj.t;
    }
  }

  // 3. Raw travelled distance to the snapped point
  const segStartDist = cumDistMeters[bestSegIndex];
  const segEndDist = cumDistMeters[bestSegIndex + 1];
  const segLength = segEndDist - segStartDist;
  let rawTravelledMeters = segStartDist + bestT * segLength;

  // 4. Monotonic Progress Smoothing & GPS Noise Filter:
  // If GPS reading reports a point that is momentarily backward by less than 50 meters,
  // hold the confirmed progress rather than jumping backward and forward.
  const prevProgressMeters = previousProgressKm * 1000;
  if (rawTravelledMeters < prevProgressMeters) {
    const backwardDiff = prevProgressMeters - rawTravelledMeters;
    if (backwardDiff < 75) {
      // Minor GPS jitter: hold steady at previous progress
      rawTravelledMeters = prevProgressMeters;
    }
  }

  // Clamp within [0, totalRouteMeters]
  const confirmedTravelledMeters = Math.max(0, Math.min(totalRouteMeters, rawTravelledMeters));
  const travelledDistanceKm = Math.round((confirmedTravelledMeters / 1000) * 100) / 100;
  const remainingDistanceKm = Math.max(
    0,
    Math.round(((totalRouteMeters - confirmedTravelledMeters) / 1000) * 100) / 100,
  );
  const progressPercent =
    totalRouteMeters > 0
      ? Math.min(100, Math.max(0, Math.round((confirmedTravelledMeters / totalRouteMeters) * 1000) / 10))
      : 0;

  const snappedPosition: [number, number] = [bestSnapLat, bestSnapLng];

  // 5. Construct cleanly split polylines connecting seamlessly at snappedPosition
  // Travelled route: from start (index 0) up to bestSegIndex, ending at snappedPosition
  const travelledCoordinates: [number, number][] = [];
  for (let i = 0; i <= bestSegIndex; i++) {
    travelledCoordinates.push(coordinates[i]);
  }
  // Append the snapped boundary point (avoid duplicating if snappedPosition is identical to last waypoint)
  const lastTravelled = travelledCoordinates[travelledCoordinates.length - 1];
  if (
    Math.abs(lastTravelled[0] - snappedPosition[0]) > 1e-7 ||
    Math.abs(lastTravelled[1] - snappedPosition[1]) > 1e-7
  ) {
    travelledCoordinates.push(snappedPosition);
  }

  // Remaining route: begins at snappedPosition, continues from bestSegIndex + 1 to end
  const remainingCoordinates: [number, number][] = [snappedPosition];
  for (let i = bestSegIndex + 1; i < numPoints; i++) {
    remainingCoordinates.push(coordinates[i]);
  }

  // If vehicle is at or near destination (>= 99.8%), remaining coordinates collapses to destination
  if (progressPercent >= 99.8) {
    const dest = coordinates[numPoints - 1];
    return {
      snappedPosition: dest,
      travelledCoordinates: [...coordinates],
      remainingCoordinates: [dest, dest],
      travelledDistanceKm: totalDistanceKm,
      remainingDistanceKm: 0,
      totalDistanceKm,
      progressPercent: 100,
      segmentIndex: numPoints - 2,
    };
  }

  return {
    snappedPosition,
    travelledCoordinates,
    remainingCoordinates,
    travelledDistanceKm,
    remainingDistanceKm,
    totalDistanceKm,
    progressPercent,
    segmentIndex: bestSegIndex,
  };
}

