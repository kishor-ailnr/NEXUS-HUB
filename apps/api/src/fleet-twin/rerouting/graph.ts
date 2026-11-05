export interface GraphNode {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  baseSpeedKmh: number;
  tollCostInr: number;
  roadQuality: 'excellent' | 'good' | 'fair';
  corridorName: string;
  hasGhatSection?: boolean;
  isCityBypass?: boolean;
  tollPlazaName?: string;
  waypoints: [number, number][]; // [lat, lng]
}

export interface CorridorGraph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

/**
 * Pre-configured Indian corridor road graphs with multiple alternate branches.
 */
export const INDIAN_CORRIDOR_GRAPHS: Record<string, CorridorGraph> = {
  // Chennai to Bengaluru (NH 48 vs Old Madras Road NH 75 vs Hosur Expressway)
  'chennai-bengaluru': {
    nodes: {
      chennai: { id: 'chennai', name: 'Chennai Port Hub', latitude: 13.0827, longitude: 80.2707 },
      sriperumbudur: { id: 'sriperumbudur', name: 'Sriperumbudur Auto Cluster', latitude: 12.9675, longitude: 79.9436 },
      ranipet: { id: 'ranipet', name: 'Ranipet Junction', latitude: 12.9276, longitude: 79.3331 },
      vellore: { id: 'vellore', name: 'Vellore Bypass', latitude: 12.9165, longitude: 79.1325 },
      ambur: { id: 'ambur', name: 'Ambur Toll', latitude: 12.7904, longitude: 78.7166 },
      krishnagiri: { id: 'krishnagiri', name: 'Krishnagiri Interchange', latitude: 12.5186, longitude: 78.2137 },
      hosur: { id: 'hosur', name: 'Hosur Border Checkpost', latitude: 12.7409, longitude: 77.8253 },
      chittoor: { id: 'chittoor', name: 'Chittoor Bypass (NH 69/40 Alt)', latitude: 13.2172, longitude: 79.1003 },
      kolar: { id: 'kolar', name: 'Kolar Gold Fields Corridor (NH 75 Alt)', latitude: 13.1378, longitude: 78.1294 },
      hoskote: { id: 'hoskote', name: 'Hoskote East Bypass', latitude: 13.0712, longitude: 77.7981 },
      bengaluru: { id: 'bengaluru', name: 'Bengaluru Electronic City Hub', latitude: 12.9716, longitude: 77.5946 },
    },
    edges: [
      // Primary Highway: NH 48 via Krishnagiri & Hosur
      {
        id: 'nh48_p1',
        from: 'chennai',
        to: 'sriperumbudur',
        distanceKm: 42,
        baseSpeedKmh: 65,
        tollCostInr: 85,
        roadQuality: 'excellent',
        corridorName: 'NH 48 Chennai-Bengaluru Expressway',
        waypoints: [[13.0827, 80.2707], [13.0125, 80.0543], [12.9675, 79.9436]],
      },
      {
        id: 'nh48_p2',
        from: 'sriperumbudur',
        to: 'vellore',
        distanceKm: 98,
        baseSpeedKmh: 75,
        tollCostInr: 140,
        roadQuality: 'excellent',
        corridorName: 'NH 48 Sriperumbudur-Vellore Segment',
        tollPlazaName: 'Walajapet Toll Plaza',
        waypoints: [[12.9675, 79.9436], [12.9276, 79.3331], [12.9165, 79.1325]],
      },
      {
        id: 'nh48_p3',
        from: 'vellore',
        to: 'krishnagiri',
        distanceKm: 120,
        baseSpeedKmh: 80,
        tollCostInr: 165,
        roadQuality: 'excellent',
        corridorName: 'NH 48 Palar River-Krishnagiri Section',
        tollPlazaName: 'Vaniyambadi Toll',
        waypoints: [[12.9165, 79.1325], [12.7904, 78.7166], [12.5186, 78.2137]],
      },
      {
        id: 'nh48_p4',
        from: 'krishnagiri',
        to: 'hosur',
        distanceKm: 52,
        baseSpeedKmh: 70,
        tollCostInr: 95,
        roadQuality: 'good',
        corridorName: 'NH 48 Krishnagiri Ghat & Tamil Nadu Border',
        hasGhatSection: true,
        waypoints: [[12.5186, 78.2137], [12.6312, 78.0124], [12.7409, 77.8253]],
      },
      {
        id: 'nh48_p5',
        from: 'hosur',
        to: 'bengaluru',
        distanceKm: 40,
        baseSpeedKmh: 45,
        tollCostInr: 80,
        roadQuality: 'good',
        corridorName: 'Attibele Border & Hosur Road Elevated Highway',
        isCityBypass: true,
        tollPlazaName: 'Attibele Toll Plaza',
        waypoints: [[12.7409, 77.8253], [12.7831, 77.7612], [12.9716, 77.5946]],
      },

      // Alternate 1: Northern Freight Corridor via Ranipet - Chittoor - Kolar - Hoskote (NH 40 + NH 75)
      {
        id: 'nh75_alt1',
        from: 'sriperumbudur',
        to: 'chittoor',
        distanceKm: 104,
        baseSpeedKmh: 65,
        tollCostInr: 60,
        roadQuality: 'good',
        corridorName: 'NH 40 Chittoor Freight Arterial',
        waypoints: [[12.9675, 79.9436], [13.0512, 79.4312], [13.2172, 79.1003]],
      },
      {
        id: 'nh75_alt2',
        from: 'chittoor',
        to: 'kolar',
        distanceKm: 110,
        baseSpeedKmh: 70,
        tollCostInr: 75,
        roadQuality: 'good',
        corridorName: 'NH 75 Old Madras Road Freight Route',
        tollPlazaName: 'Mulbagal Toll Plaza',
        waypoints: [[13.2172, 79.1003], [13.1654, 78.5812], [13.1378, 78.1294]],
      },
      {
        id: 'nh75_alt3',
        from: 'kolar',
        to: 'hoskote',
        distanceKm: 44,
        baseSpeedKmh: 75,
        tollCostInr: 50,
        roadQuality: 'excellent',
        corridorName: 'NH 75 Kolar-Hoskote Expressway',
        waypoints: [[13.1378, 78.1294], [13.0712, 77.7981]],
      },
      {
        id: 'nh75_alt4',
        from: 'hoskote',
        to: 'bengaluru',
        distanceKm: 28,
        baseSpeedKmh: 50,
        tollCostInr: 0,
        roadQuality: 'good',
        corridorName: 'Old Madras Road City Entry',
        isCityBypass: true,
        waypoints: [[13.0712, 77.7981], [12.9812, 77.6712], [12.9716, 77.5946]],
      },

      // Alternate 2: Direct Expressway Bypass connection from Ranipet to Hoskote
      {
        id: 'ne5_direct',
        from: 'ranipet',
        to: 'hoskote',
        distanceKm: 195,
        baseSpeedKmh: 95,
        tollCostInr: 320,
        roadQuality: 'excellent',
        corridorName: 'NE 5 Greenfield Access-Controlled Expressway',
        waypoints: [[12.9276, 79.3331], [13.0821, 78.5123], [13.0712, 77.7981]],
      },
    ],
  },
};

