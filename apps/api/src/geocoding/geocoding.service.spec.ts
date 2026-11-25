import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let service: GeocodingService;

  beforeEach(() => {
    service = new GeocodingService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns null for empty address query', async () => {
    const coords = await service.geocodeAddress('');
    expect(coords).toBeNull();
  });

  it('geocodes a real known address using Nominatim API and returns valid coordinates', async () => {
    const address = 'Gateway of India, Mumbai, India';
    const result = await service.geocodeAddress(address);
    console.log(`[Nominatim Live Geocoding Output] Query: "${address}" -> Latitude: ${result?.latitude}, Longitude: ${result?.longitude}`);
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeGreaterThanOrEqual(18.8);
    expect(result!.latitude).toBeLessThanOrEqual(19.2);
    expect(result!.longitude).toBeGreaterThanOrEqual(72.7);
    expect(result!.longitude).toBeLessThanOrEqual(73.0);
  }, 15000);

  it('reverse geocodes coordinates to human readable address with city and state', async () => {
    const result = await service.reverseGeocode(11.0168, 76.9558);
    expect(result).toBeDefined();
    expect(result.city || result.formatted).toContain('Coimbatore');
    expect(result.state).toBe('Tamil Nadu');
  });
});
