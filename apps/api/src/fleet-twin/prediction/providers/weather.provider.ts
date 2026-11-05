import { Injectable } from '@nestjs/common';

export interface WeatherForecast {
  condition: 'clear' | 'rain' | 'heavy_rain' | 'fog' | 'heatwave' | 'cyclone_alert' | 'ghat_mist';
  temperatureC: number;
  precipitationMm: number;
  visibilityKm: number;
  speedReductionPct: number;
  description: string;
}

export interface WeatherProvider {
  getWeatherForecast(
    lat: number,
    lng: number,
    timestamp: Date,
    severityMultiplier?: number,
  ): Promise<WeatherForecast>;
}

@Injectable()
export class MockWeatherProvider implements WeatherProvider {
  async getWeatherForecast(
    lat: number,
    lng: number,
    timestamp: Date,
    severityMultiplier = 1.0,
  ): Promise<WeatherForecast> {
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
      };
    }

    return {
      condition: 'clear',
      temperatureC: 29,
      precipitationMm: 0,
      visibilityKm: 10,
      speedReductionPct: 0,
      description: 'Clear weather conditions with dry highway pavement',
    };
  }
}

