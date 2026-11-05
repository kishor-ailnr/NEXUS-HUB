import { Injectable } from '@nestjs/common';

export interface TollStatus {
  plazaName: string;
  fastagQueueLengthVehicles: number;
  expectedWaitMinutes: number;
  isSurge: boolean;
  tollFeeInr: number;
  description: string;
}

export interface TollProvider {
  getTollStatus(
    plazaName: string,
    timestamp: Date,
    strikeHoursBonus?: number,
  ): Promise<TollStatus>;
}

@Injectable()
export class MockTollProvider implements TollProvider {
  async getTollStatus(
    plazaName: string,
    timestamp: Date,
    strikeHoursBonus = 0,
  ): Promise<TollStatus> {
    const hour = timestamp.getHours();
    const isNightSurge = hour >= 22 || hour <= 4; // Commercial freight transit window
    const isDayRush = (hour >= 8 && hour <= 10) || (hour >= 18 && hour <= 20);

    let queue = 6;
    let wait = 4;
    let isSurge = false;

    if (strikeHoursBonus > 0) {
      queue = 45;
      wait = Math.round(strikeHoursBonus * 40);
      isSurge = true;
      return {
        plazaName,
        fastagQueueLengthVehicles: queue,
        expectedWaitMinutes: wait,
        isSurge: true,
        tollFeeInr: 340,
        description: `Toll plaza operations restricted due to local protest/strike (${wait}m wait)`,
      };
    }

    if (isNightSurge) {
      queue = 22;
      wait = 18;
      isSurge = true;
    } else if (isDayRush) {
      queue = 14;
      wait = 10;
      isSurge = true;
    }

    return {
      plazaName,
      fastagQueueLengthVehicles: queue,
      expectedWaitMinutes: wait,
      isSurge,
      tollFeeInr: 340,
      description: isSurge
        ? `FASTag commercial freight queue peak (${wait}m wait, ~${queue} trucks queued)`
        : `Normal automated FASTag electronic clearance (${wait}m wait)`,
    };
  }
}

