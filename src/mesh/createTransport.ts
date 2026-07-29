/**
 * Picks the transport from configuration.
 *
 * This one function is the entire cost of switching between Plan A and Plan B.
 * FALLBACKS.md argued that keeping packet.ts and relay.ts transport-agnostic
 * would make the fallback "a new file, not a rewrite" — and because the BLE
 * spike (CONTEXT.md Phase 1) needs two physical phones and cannot be cleared
 * from a development machine, both plans are built and the spike's outcome is
 * a single line in `.env`:
 *
 *     VOX_MESH_TRANSPORT=ble       spike passed  → real multi-hop mesh
 *     VOX_MESH_TRANSPORT=wifi      spike failed  → local hub, still no internet
 *     VOX_MESH_TRANSPORT=loopback  development   → in-process, no radio
 */

import type {VoxConfig} from '../config/schema';
import {BleTransport} from './bleTransport';
import {LoopbackBus, LoopbackTransport} from './loopbackTransport';
import type {MeshTransport} from './transport';
import {WifiTransport} from './wifiTransport';

/** Shared by every loopback transport in the process. */
const devBus = new LoopbackBus();

export function createTransport(config: VoxConfig): MeshTransport {
  switch (config.transport) {
    case 'ble':
      return new BleTransport(config);
    case 'wifi':
      return new WifiTransport(config);
    case 'loopback':
      return new LoopbackTransport({nodeId: 'device', bus: devBus});
  }
}
