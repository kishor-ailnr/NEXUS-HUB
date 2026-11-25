import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { GeocodingService, ReverseGeocodeResult } from './geocoding.service';

@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('reverse')
  async reverseGeocode(
    @Query('lat') latStr: string,
    @Query('lng') lngStr: string,
  ): Promise<ReverseGeocodeResult> {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new BadRequestException('Valid latitude (-90 to 90) and longitude (-180 to 180) required');
    }

    const result = await this.geocodingService.reverseGeocode(lat, lng);
    if (!result) {
      return {
        formatted: `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`,
      };
    }
    return result;
  }
}

