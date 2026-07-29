/**
 * Everything the mesh has told us, in the shape screens render.
 *
 * Thin over `meshModel.ts`, which holds the actual logic and is tested. This
 * file's job is zustand plumbing and persistence.
 */

import {create} from 'zustand';
import type {MeshCounters, PeerInfo, ReceivedPacket} from '../mesh/meshService';
import type {MeshPacket} from '../mesh/packet';
import {IDLE_STATUS, type TransportStatus} from '../mesh/transport';
import {VAULT_KEYS, type Vault} from '../storage/vault';
import {
  MAX_MESSAGES,
  MAX_SOS_EVENTS,
  appendBounded,
  dangerPinFromPacket,
  mergeDangerPins,
  messageFromOwnPacket,
  messageFromPacket,
  sosFromPacket,
  type DangerPin,
  type MeshMessage,
  type SosEvent,
} from './meshModel';

interface MeshState {
  status: TransportStatus;
  peers: PeerInfo[];
  messages: MeshMessage[];
  dangerPins: DangerPin[];
  sosEvents: SosEvent[];
  stats: MeshCounters | null;
  /** Bumped whenever a new SOS arrives, so the bottom nav can show its dot. */
  unreadAlerts: number;

  hydrate(vault: Vault): void;
  setStatus(status: TransportStatus): void;
  setPeers(peers: PeerInfo[]): void;
  setStats(stats: MeshCounters): void;
  ingest(vault: Vault | null, received: ReceivedPacket): void;
  ingestOwn(vault: Vault | null, packet: MeshPacket): void;
  markAlertsRead(): void;
  reset(): void;
}

const EMPTY = {
  status: IDLE_STATUS,
  peers: [] as PeerInfo[],
  messages: [] as MeshMessage[],
  dangerPins: [] as DangerPin[],
  sosEvents: [] as SosEvent[],
  stats: null,
  unreadAlerts: 0,
};

export const useMeshStore = create<MeshState>((set, get) => ({
  ...EMPTY,

  hydrate: vault => {
    set({
      messages: vault.getJSON<MeshMessage[]>(VAULT_KEYS.messages, []),
      dangerPins: vault.getJSON<DangerPin[]>(VAULT_KEYS.dangerPins, []),
    });
  },

  setStatus: status => set({status}),
  setPeers: peers => set({peers}),
  setStats: stats => set({stats}),

  ingest: (vault, received) => {
    switch (received.packet.type) {
      case 'text': {
        const message = messageFromPacket(received);
        if (!message) return;
        const messages = appendBounded(get().messages, message, MAX_MESSAGES);
        set({messages});
        vault?.setJSON(VAULT_KEYS.messages, messages);
        return;
      }
      case 'danger': {
        const pin = dangerPinFromPacket(received);
        if (!pin) return;
        const dangerPins = mergeDangerPins(get().dangerPins, pin);
        set({dangerPins});
        vault?.setJSON(VAULT_KEYS.dangerPins, dangerPins);
        return;
      }
      case 'sos': {
        const sos = sosFromPacket(received);
        if (!sos) return;
        set(state => ({
          sosEvents: appendBounded(state.sosEvents, sos, MAX_SOS_EVENTS),
          unreadAlerts: state.unreadAlerts + 1,
        }));
        // SOS events are deliberately NOT persisted. They are the most
        // incriminating thing the app handles — a record of who called for
        // help and where — and they are only useful in the minutes after they
        // arrive. Keeping them in memory means closing the app disposes of
        // them, which is the right default for this threat model.
        return;
      }
      case 'safe':
        // Nothing to store. Handled live by the screens that care.
        return;
    }
  },

  ingestOwn: (vault, packet) => {
    const message = messageFromOwnPacket(packet);
    if (!message) return;
    const messages = appendBounded(get().messages, message, MAX_MESSAGES);
    set({messages});
    vault?.setJSON(VAULT_KEYS.messages, messages);
  },

  markAlertsRead: () => set({unreadAlerts: 0}),

  reset: () => set({...EMPTY}),
}));
