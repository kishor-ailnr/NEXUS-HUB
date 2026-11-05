export interface TrafficStatus {
  congestionLevel: 'low' | 'moderate' | 'heavy' | 'gridlock';
  delayMinutes: number;
  averageSpeedKmh: number;
  description: string;
}

export interface TrafficProvider {
  getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry: boolean,
  ): Promise<TrafficStatus>;
}

export class MockTrafficProvider implements TrafficProvider {
  async getTrafficStatus(
    lat: number,
    lng: number,
    timestamp: Date,
    isBypassOrCityEntry = false,
  ): Promise<TrafficStatus> {
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
        const delay = Math.round(25 + seed * 25);
        return {
          congestionLevel: delay > 35 ? 'gridlock' : 'heavy',
          delayMinutes: delay,
          averageSpeedKmh: 18,
          description: `Urban periphery ring-road bottleneck during peak commuting (${delay}m delay)`,
        };
      }
      if (isWeekend && hour >= 16 && hour <= 21) {
        const delay = Math.round(15 + seed * 15);
        return {
          congestionLevel: 'moderate',
          delayMinutes: delay,
          averageSpeedKmh: 35,
          description: `Weekend city exit passenger vehicle surge (${delay}m delay)`,
        };
      }
    }

    // Highway accident / maintenance sporadic occurrence
    if (seed > 0.88) {
      const delay = Math.round(30 + seed * 30);
      return {
        congestionLevel: 'heavy',
        delayMinutes: delay,
        averageSpeedKmh: 20,
        description: `Unscheduled highway lane closure due to road surface maintenance (${delay}m delay)`,
      };
    }

    if (isMorningRush || isEveningRush) {
      const delay = Math.round(10 + seed * 10);
      return {
        congestionLevel: 'moderate',
        delayMinutes: delay,
        averageSpeedKmh: 48,
        description: `Dense inter-city corridor flow (${delay}m delay)`,
      };
    }

    return {
      congestionLevel: 'low',
      delayMinutes: 0,
      averageSpeedKmh: 68,
      description: 'Free-flowing multi-lane national expressway corridor',
    };
  }
}

