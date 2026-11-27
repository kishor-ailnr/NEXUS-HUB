import { TomTomTrafficProvider } from './traffic.provider';

describe('TomTomTrafficProvider', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('falls back to BASELINE_FALLBACK with API_KEY_MISSING when TOMTOM_API_KEY is unset', async () => {
    delete process.env.TOMTOM_API_KEY;
    const provider = new TomTomTrafficProvider();

    const telemetry = await provider.getNormalizedTraffic('veh-1', 12.97, 79.16);
    const diag = provider.getDiagnostics();

    expect(telemetry.provenance).toBe('BASELINE_FALLBACK');
    expect(telemetry.data_source).toContain('Baseline');
    expect(diag.api_key_configured).toBe(false);
    expect(diag.error_category).toBe('API_KEY_MISSING');
    expect(diag.status).toBe('FAILED');
  });

  it('parses successful TomTom Flow Segment Data v4 response as LIVE_TOMTOM and caches subsequent calls', async () => {
    process.env.TOMTOM_API_KEY = 'test-tomtom-key-not-secret';
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        flowSegmentData: {
          frc: 'FRC2',
          currentSpeed: 42,
          freeFlowSpeed: 70,
          currentTravelTime: 1200,
          freeFlowTravelTime: 600,
          confidence: 0.96,
          roadClosure: false,
        },
      }),
    });
    global.fetch = mockFetch as any;

    const provider = new TomTomTrafficProvider();
    const live = await provider.getNormalizedTraffic('veh-1', 12.9712, 79.1623);

    expect(live.provenance).toBe('LIVE_TOMTOM');
    expect(live.current_speed_kmh).toBe(42);
    expect(live.free_flow_speed_kmh).toBe(70);
    expect(live.speed_reduction_pct).toBe(40);
    expect(live.estimated_delay_minutes).toBe(10);
    expect(live.congestion_level).toBe('heavy');
    expect(live.confidence_pct).toBe(96);
    expect(live.functional_road_class).toBe('FRC2');
    expect(live.road_closure).toBe(false);
    expect(live.provider_status).toBe('CONNECTED');

    // Second call for same coordinate bucket uses CACHED_TOMTOM without calling fetch again
    const cached = await provider.getNormalizedTraffic('veh-2', 12.9719, 79.1618);
    expect(cached.provenance).toBe('CACHED_TOMTOM');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const diag = provider.getDiagnostics();
    expect(diag.status).toBe('CONNECTED');
    expect(diag.success_count).toBe(1);
    expect(diag.failure_count).toBe(0);
    expect(diag.last_http_status).toBe(200);
  });

  it('handles 401/403 AUTH_ERROR without crashing and records diagnostics', async () => {
    process.env.TOMTOM_API_KEY = 'invalid-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as any;

    const provider = new TomTomTrafficProvider();
    const res = await provider.getNormalizedTraffic('veh-1', 13.08, 80.27);
    const diag = provider.getDiagnostics();

    expect(res.provenance).toBe('BASELINE_FALLBACK');
    expect(diag.last_http_status).toBe(403);
    expect(diag.error_category).toBe('AUTH_ERROR');
    expect(diag.status).toBe('FAILED');
  });

  it('handles 429 RATE_LIMIT and falls back safely', async () => {
    process.env.TOMTOM_API_KEY = 'rate-limited-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 }) as any;

    const provider = new TomTomTrafficProvider();
    const res = await provider.getNormalizedTraffic('veh-1', 19.07, 72.87);
    const diag = provider.getDiagnostics();

    expect(res.provenance).toBe('BASELINE_FALLBACK');
    expect(diag.last_http_status).toBe(429);
    expect(diag.error_category).toBe('RATE_LIMIT');
  });

  it('handles request timeout (AbortError)', async () => {
    process.env.TOMTOM_API_KEY = 'timeout-key';
    const abortErr = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abortErr) as any;

    const provider = new TomTomTrafficProvider();
    const res = await provider.getNormalizedTraffic('veh-1', 18.52, 73.85);
    const diag = provider.getDiagnostics();

    expect(res.provenance).toBe('BASELINE_FALLBACK');
    expect(diag.error_category).toBe('TIMEOUT');
  });

  it('handles invalid coordinates without calling TomTom API', async () => {
    process.env.TOMTOM_API_KEY = 'valid-key';
    const mockFetch = jest.fn();
    global.fetch = mockFetch as any;

    const provider = new TomTomTrafficProvider();
    const res = await provider.getNormalizedTraffic('veh-1', 999, 77.59);
    const diag = provider.getDiagnostics();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(res.provenance).toBe('BASELINE_FALLBACK');
    expect(diag.error_category).toBe('INVALID_COORDINATES');
  });

  it('handles malformed TomTom JSON missing flowSegmentData', async () => {
    process.env.TOMTOM_API_KEY = 'valid-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    }) as any;

    const provider = new TomTomTrafficProvider();
    const res = await provider.getNormalizedTraffic('veh-1', 28.61, 77.20);
    const diag = provider.getDiagnostics();

    expect(res.provenance).toBe('BASELINE_FALLBACK');
    expect(diag.error_category).toBe('INVALID_RESPONSE');
  });
});
