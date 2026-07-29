import {DEFAULT_CONFIG, parseConfig} from '../schema';

describe('parseConfig', () => {
  it('returns documented defaults when nothing is set', () => {
    const {config, warnings} = parseConfig({});
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual([]);
  });

  it('reads a fully populated env', () => {
    const {config, warnings} = parseConfig({
      VOX_MESH_TRANSPORT: 'wifi',
      VOX_BLE_MANUFACTURER_ID: '1234',
      VOX_BLE_SERVICE_UUID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      VOX_BLE_FRAME_INTERVAL_MS: '300',
      VOX_WIFI_HUB_URL: 'ws://10.0.0.5:9000',
      VOX_WIFI_HUB_PORT: '9000',
      VOX_MESH_MAX_TTL: '3',
      VOX_RELAY_SEEN_TTL_MS: '120000',
      VOX_PEER_TIMEOUT_MS: '30000',
      VOX_DEBUG_LOGS: 'true',
    });
    expect(warnings).toEqual([]);
    expect(config).toEqual({
      transport: 'wifi',
      bleManufacturerId: 1234,
      bleServiceUuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      bleFrameIntervalMs: 300,
      wifiHubUrl: 'ws://10.0.0.5:9000',
      wifiHubPort: 9000,
      meshMaxTtl: 3,
      relaySeenTtlMs: 120000,
      peerTimeoutMs: 30000,
      debugLogs: true,
    });
  });

  describe('transport', () => {
    it.each(['ble', 'wifi', 'loopback'] as const)('accepts %s', kind => {
      expect(parseConfig({VOX_MESH_TRANSPORT: kind}).config.transport).toBe(
        kind,
      );
    });

    it('is case insensitive and tolerates stray whitespace', () => {
      const {config, warnings} = parseConfig({
        VOX_MESH_TRANSPORT: '  WiFi  ',
      });
      expect(config.transport).toBe('wifi');
      expect(warnings).toEqual([]);
    });

    it('falls back and warns on an unknown transport', () => {
      const {config, warnings} = parseConfig({VOX_MESH_TRANSPORT: 'carrier'});
      expect(config.transport).toBe(DEFAULT_CONFIG.transport);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('carrier');
    });
  });

  describe('numeric bounds', () => {
    it('rejects a manufacturer id that does not fit in 16 bits', () => {
      // 0x10000 would be silently truncated by the BLE stack, producing
      // advertisements nobody scanning for VOX would ever match.
      const {config, warnings} = parseConfig({
        VOX_BLE_MANUFACTURER_ID: '65536',
      });
      expect(config.bleManufacturerId).toBe(DEFAULT_CONFIG.bleManufacturerId);
      expect(warnings[0]).toContain('VOX_BLE_MANUFACTURER_ID');
    });

    it('accepts the exact 16-bit maximum', () => {
      const {config, warnings} = parseConfig({
        VOX_BLE_MANUFACTURER_ID: '65535',
      });
      expect(config.bleManufacturerId).toBe(65535);
      expect(warnings).toEqual([]);
    });

    it('rejects a frame interval the radio cannot keep up with', () => {
      const {config, warnings} = parseConfig({
        VOX_BLE_FRAME_INTERVAL_MS: '10',
      });
      expect(config.bleFrameIntervalMs).toBe(DEFAULT_CONFIG.bleFrameIntervalMs);
      expect(warnings[0]).toContain('100..5000');
    });

    it('rejects a TTL that would flood a dense mesh', () => {
      const {config} = parseConfig({VOX_MESH_MAX_TTL: '99'});
      expect(config.meshMaxTtl).toBe(DEFAULT_CONFIG.meshMaxTtl);
    });

    it('rejects non-integers rather than coercing them', () => {
      const {config, warnings} = parseConfig({VOX_MESH_MAX_TTL: '3.7'});
      expect(config.meshMaxTtl).toBe(DEFAULT_CONFIG.meshMaxTtl);
      expect(warnings[0]).toContain('not an integer');
    });

    it('rejects non-numeric junk', () => {
      const {config, warnings} = parseConfig({VOX_MESH_MAX_TTL: 'five'});
      expect(config.meshMaxTtl).toBe(DEFAULT_CONFIG.meshMaxTtl);
      expect(warnings[0]).toContain('not an integer');
    });

    it('treats an empty string as unset, without warning', () => {
      const {config, warnings} = parseConfig({VOX_MESH_MAX_TTL: '   '});
      expect(config.meshMaxTtl).toBe(DEFAULT_CONFIG.meshMaxTtl);
      expect(warnings).toEqual([]);
    });
  });

  describe('service UUID', () => {
    it('normalises case', () => {
      const {config} = parseConfig({
        VOX_BLE_SERVICE_UUID: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      });
      expect(config.bleServiceUuid).toBe(
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      );
    });

    it('falls back on a malformed UUID', () => {
      const {config, warnings} = parseConfig({
        VOX_BLE_SERVICE_UUID: 'not-a-uuid',
      });
      expect(config.bleServiceUuid).toBe(DEFAULT_CONFIG.bleServiceUuid);
      expect(warnings[0]).toContain('valid UUID');
    });
  });

  describe('hub URL', () => {
    it('accepts ws and wss', () => {
      expect(parseConfig({VOX_WIFI_HUB_URL: 'ws://a'}).config.wifiHubUrl).toBe(
        'ws://a',
      );
      expect(parseConfig({VOX_WIFI_HUB_URL: 'wss://a'}).config.wifiHubUrl).toBe(
        'wss://a',
      );
    });

    it('rejects an http URL, which would never open a socket', () => {
      const {config, warnings} = parseConfig({
        VOX_WIFI_HUB_URL: 'http://192.168.43.1:8787',
      });
      expect(config.wifiHubUrl).toBe(DEFAULT_CONFIG.wifiHubUrl);
      expect(warnings[0]).toContain('ws://');
    });
  });

  describe('debugLogs', () => {
    it('is true only for an explicit "true"', () => {
      expect(parseConfig({VOX_DEBUG_LOGS: 'true'}).config.debugLogs).toBe(true);
      expect(parseConfig({VOX_DEBUG_LOGS: 'TRUE'}).config.debugLogs).toBe(true);
    });

    it.each(['1', 'yes', 'on', '', 'false', undefined])(
      'fails closed for %p, because the logs contain packet contents',
      value => {
        expect(parseConfig({VOX_DEBUG_LOGS: value}).config.debugLogs).toBe(
          false,
        );
      },
    );
  });

  it('collects every warning rather than stopping at the first', () => {
    const {warnings} = parseConfig({
      VOX_MESH_TRANSPORT: 'nope',
      VOX_MESH_MAX_TTL: '999',
      VOX_BLE_SERVICE_UUID: 'bad',
    });
    expect(warnings).toHaveLength(3);
  });
});
