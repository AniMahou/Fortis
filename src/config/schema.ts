/**
 * Parsing and validation for everything in `.env`.
 *
 * Kept free of React Native imports so it can be unit tested on a laptop —
 * the same rule the mesh and crypto layers follow. `src/config/env.ts` is the
 * thin binding that feeds real react-native-config values through here.
 *
 * The design rule: a malformed or missing value falls back to a documented
 * default and records a warning, rather than throwing. A typo in `.env` should
 * not be the reason the app fails to start in the middle of a blackout.
 */

export type TransportKind = 'ble' | 'wifi' | 'loopback';

export interface VoxConfig {
  /** Which transport carries mesh packets. See docs/FALLBACKS.md. */
  transport: TransportKind;
  /** 16-bit BLE company identifier. 0xFFFF is the SIG's testing value. */
  bleManufacturerId: number;
  bleServiceUuid: string;
  /** How long each chunk frame stays on air before the next replaces it. */
  bleFrameIntervalMs: number;
  wifiHubUrl: string;
  wifiHubPort: number;
  /** Max hops before a packet dies out. */
  meshMaxTtl: number;
  /** How long a node remembers a packet id for de-duplication. */
  relaySeenTtlMs: number;
  /** Drop a peer from the nearby count after this long unheard. */
  peerTimeoutMs: number;
  debugLogs: boolean;
}

export const DEFAULT_CONFIG: VoxConfig = {
  transport: 'ble',
  bleManufacturerId: 0xffff,
  bleServiceUuid: '7b8e5a10-9f34-4c21-8a6d-1f2e3c4d5b60',
  bleFrameIntervalMs: 220,
  wifiHubUrl: 'ws://192.168.43.1:8787',
  wifiHubPort: 8787,
  meshMaxTtl: 5,
  relaySeenTtlMs: 10 * 60 * 1000,
  peerTimeoutMs: 60 * 1000,
  debugLogs: false,
};

export interface ParseResult {
  config: VoxConfig;
  /** Human-readable notes about values that were rejected and defaulted. */
  warnings: string[];
}

const TRANSPORTS: readonly TransportKind[] = ['ble', 'wifi', 'loopback'];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IntBounds {
  min: number;
  max: number;
}

function parseIntOption(
  raw: string | undefined,
  fallback: number,
  bounds: IntBounds,
  name: string,
  warnings: string[],
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    warnings.push(`${name}="${raw}" is not an integer; using ${fallback}`);
    return fallback;
  }
  if (value < bounds.min || value > bounds.max) {
    warnings.push(
      `${name}=${value} is outside ${bounds.min}..${bounds.max}; using ${fallback}`,
    );
    return fallback;
  }
  return value;
}

export function parseConfig(
  raw: Record<string, string | undefined> = {},
): ParseResult {
  const warnings: string[] = [];

  const transportRaw = raw.VOX_MESH_TRANSPORT?.trim().toLowerCase();
  let transport = DEFAULT_CONFIG.transport;
  if (transportRaw !== undefined && transportRaw !== '') {
    if ((TRANSPORTS as readonly string[]).includes(transportRaw)) {
      transport = transportRaw as TransportKind;
    } else {
      warnings.push(
        `VOX_MESH_TRANSPORT="${transportRaw}" is not one of ` +
          `${TRANSPORTS.join('|')}; using ${DEFAULT_CONFIG.transport}`,
      );
    }
  }

  const uuidRaw = raw.VOX_BLE_SERVICE_UUID?.trim();
  let bleServiceUuid = DEFAULT_CONFIG.bleServiceUuid;
  if (uuidRaw !== undefined && uuidRaw !== '') {
    if (UUID_PATTERN.test(uuidRaw)) {
      bleServiceUuid = uuidRaw.toLowerCase();
    } else {
      warnings.push(
        `VOX_BLE_SERVICE_UUID="${uuidRaw}" is not a valid UUID; ` +
          `using ${DEFAULT_CONFIG.bleServiceUuid}`,
      );
    }
  }

  const hubRaw = raw.VOX_WIFI_HUB_URL?.trim();
  let wifiHubUrl = DEFAULT_CONFIG.wifiHubUrl;
  if (hubRaw !== undefined && hubRaw !== '') {
    if (/^wss?:\/\/\S+$/.test(hubRaw)) {
      wifiHubUrl = hubRaw;
    } else {
      warnings.push(
        `VOX_WIFI_HUB_URL="${hubRaw}" must start with ws:// or wss://; ` +
          `using ${DEFAULT_CONFIG.wifiHubUrl}`,
      );
    }
  }

  const config: VoxConfig = {
    transport,
    bleServiceUuid,
    wifiHubUrl,
    bleManufacturerId: parseIntOption(
      raw.VOX_BLE_MANUFACTURER_ID,
      DEFAULT_CONFIG.bleManufacturerId,
      {min: 0, max: 0xffff},
      'VOX_BLE_MANUFACTURER_ID',
      warnings,
    ),
    bleFrameIntervalMs: parseIntOption(
      raw.VOX_BLE_FRAME_INTERVAL_MS,
      DEFAULT_CONFIG.bleFrameIntervalMs,
      // Below ~100ms the radio cannot keep up with data changes and frames
      // are dropped silently, which looks like packet loss but is not.
      {min: 100, max: 5000},
      'VOX_BLE_FRAME_INTERVAL_MS',
      warnings,
    ),
    wifiHubPort: parseIntOption(
      raw.VOX_WIFI_HUB_PORT,
      DEFAULT_CONFIG.wifiHubPort,
      {min: 1024, max: 65535},
      'VOX_WIFI_HUB_PORT',
      warnings,
    ),
    meshMaxTtl: parseIntOption(
      raw.VOX_MESH_MAX_TTL,
      DEFAULT_CONFIG.meshMaxTtl,
      // TTL is one byte on the wire, and anything past ~10 hops multiplies
      // rebroadcast traffic far faster than it extends useful reach.
      {min: 1, max: 15},
      'VOX_MESH_MAX_TTL',
      warnings,
    ),
    relaySeenTtlMs: parseIntOption(
      raw.VOX_RELAY_SEEN_TTL_MS,
      DEFAULT_CONFIG.relaySeenTtlMs,
      {min: 10_000, max: 60 * 60 * 1000},
      'VOX_RELAY_SEEN_TTL_MS',
      warnings,
    ),
    peerTimeoutMs: parseIntOption(
      raw.VOX_PEER_TIMEOUT_MS,
      DEFAULT_CONFIG.peerTimeoutMs,
      {min: 5_000, max: 30 * 60 * 1000},
      'VOX_PEER_TIMEOUT_MS',
      warnings,
    ),
    // Anything other than an explicit "true" is false. Debug logging includes
    // packet contents and peer ids — the exact metadata this app exists not to
    // leak — so it fails closed.
    debugLogs: raw.VOX_DEBUG_LOGS?.trim().toLowerCase() === 'true',
  };

  return {config, warnings};
}
