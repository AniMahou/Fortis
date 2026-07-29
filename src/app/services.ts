/**
 * Application wiring — the one place storage, the mesh and the stores meet.
 *
 * Everything below this file is either pure logic or a thin native binding,
 * and everything above it is React. This is the seam, and keeping it a single
 * module means there is exactly one answer to "what happens when the app
 * starts" and one answer to "what happens on panic wipe".
 */

import nacl from 'tweetnacl';
import {encodeBase64} from 'tweetnacl-util';
import {config} from '../config/env';
import {sign} from '../crypto/sign';
import {createTransport} from '../mesh/createTransport';
import {MeshService, type MeshIdentity} from '../mesh/meshService';
import type {DangerKind} from '../mesh/payloads';
import {getCurrentPosition, type VoxPosition} from '../native/VoxLocation';
import {initStorage, resetStorageCache, type StorageContext} from '../storage';
import type {WipeReport} from '../storage/panicWipe';
import {useIdentityStore} from '../state/identityStore';
import {useMeshStore} from '../state/meshStore';

export interface Services {
  storage: StorageContext;
  mesh: MeshService;
}

let services: Services | null = null;
let starting: Promise<Services> | null = null;

/**
 * Called once from the splash screen.
 *
 * CONTEXT.md asks for the splash to be a real initialisation step rather than
 * a timed delay, and this is that step: it opens the encrypted store, loads or
 * creates the device keypair, and brings the mesh up.
 */
export async function startServices(): Promise<Services> {
  if (services) return services;
  if (starting) return starting;

  starting = (async () => {
    const storage = await initStorage();

    const identity: MeshIdentity = {
      // senderId is the public key itself, not a separate identifier — see
      // wire.ts. It is what receivers verify signatures against.
      senderId: encodeBase64(storage.keyPair.publicKey),
      publicKey: storage.keyPair.publicKey,
      sign: canonical => sign(canonical, storage.keyPair.secretKey),
    };

    const mesh = new MeshService({
      transport: createTransport(config),
      identity,
      config,
      randomBytes: nacl.randomBytes,
    });

    const meshStore = useMeshStore.getState();

    mesh.subscribe({
      onPacket: received => {
        useMeshStore.getState().ingest(storage.vault, received);
        useMeshStore.getState().setStats(mesh.stats);
      },
      onPeersChanged: peers => useMeshStore.getState().setPeers(peers),
      onStatus: status => useMeshStore.getState().setStatus(status),
      onDropped: () => useMeshStore.getState().setStats(mesh.stats),
    });

    useIdentityStore.getState().hydrate(storage.vault, {
      fingerprint: storage.fingerprint,
      protection: storage.protection,
    });
    meshStore.hydrate(storage.vault);

    // Deliberately not awaited. A transport that cannot start — Bluetooth off,
    // permissions declined — must not stop the app from opening; it reports
    // itself through onStatus and the UI shows why.
    void mesh.start();

    services = {storage, mesh};
    return services;
  })();

  return starting;
}

export function getServices(): Services | null {
  return services;
}

function requireServices(): Services {
  if (!services) {
    throw new Error('startServices() has not completed yet');
  }
  return services;
}

// ------------------------------------------------------------------ sending

export async function sendMeshText(text: string): Promise<void> {
  const {mesh, storage} = requireServices();
  const packet = await mesh.sendText(text);
  // Shown immediately as ours. Not an optimistic guess about delivery — a
  // broadcast mesh has no acknowledgements, so `mine` messages carry no hop
  // badge rather than a "sent" tick that would claim more than we know.
  useMeshStore.getState().ingestOwn(storage.vault, packet);
  useMeshStore.getState().setStats(mesh.stats);
}

export interface SosResult {
  position: VoxPosition;
  sentAt: number;
  peerCount: number;
}

/**
 * Captures a fix and broadcasts an SOS.
 *
 * Never blocks indefinitely on GPS. The native side falls back to a last-known
 * position and flags it `stale`, which the confirmation screen shows — telling
 * someone help is coming to a ten-minute-old location without saying so would
 * be worse than admitting the fix is old.
 */
export async function sendSos(): Promise<SosResult> {
  const {mesh} = requireServices();
  const position = await getCurrentPosition(8000);
  await mesh.sendSos({
    lat: position.latitude,
    lng: position.longitude,
    accuracy: position.accuracy,
    stale: position.stale,
  });
  useMeshStore.getState().setStats(mesh.stats);
  return {
    position,
    sentAt: Date.now(),
    peerCount: mesh.activePeers().length,
  };
}

export async function sendDangerReport(
  kind: DangerKind,
  note?: string,
): Promise<VoxPosition> {
  const {mesh} = requireServices();
  const position = await getCurrentPosition(8000);
  await mesh.sendDanger({
    lat: position.latitude,
    lng: position.longitude,
    kind,
    ...(note ? {note} : {}),
  });
  useMeshStore.getState().setStats(mesh.stats);
  return position;
}

export async function sendImSafe(): Promise<void> {
  const {mesh} = requireServices();
  try {
    const position = await getCurrentPosition(4000);
    await mesh.sendSafe({lat: position.latitude, lng: position.longitude});
  } catch {
    // Saying you are alive should not require saying where you are, and it
    // should certainly not fail because GPS could not get a fix indoors.
    await mesh.sendSafe(null);
  }
}

// --------------------------------------------------------------- panic wipe

/**
 * Destroys everything on this device.
 *
 * The order inside `panicWipe` matters and is documented there — the key goes
 * first, so an interrupted wipe still leaves nothing readable. What this
 * function adds is the in-memory half: the mesh's seen-packet set and both
 * zustand stores. Data still on screen after a wipe would be the most visible
 * possible failure.
 */
export async function performPanicWipe(): Promise<WipeReport> {
  const current = services;
  if (!current) {
    throw new Error('Cannot wipe before services have started');
  }

  const report = await current.storage.wipe([
    () => current.mesh.reset(),
    () => useMeshStore.getState().reset(),
    () => useIdentityStore.getState().reset(),
  ]);

  await current.mesh.stop();
  services = null;
  starting = null;
  resetStorageCache();

  return report;
}

/** Test/dev seam. Does not wipe anything. */
export function resetServices(): void {
  services = null;
  starting = null;
  resetStorageCache();
}
