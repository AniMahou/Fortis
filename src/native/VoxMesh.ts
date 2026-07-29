/**
 * JS binding for VoxMeshModule (android/.../VoxMeshModule.kt).
 *
 * Thin on purpose: base64 in, base64 out, no policy. Everything that decides
 * *what* to broadcast lives in `mesh/bleTransport.ts`, which is testable.
 */

import {NativeEventEmitter, NativeModules, type EmitterSubscription} from 'react-native';

export interface BleCapabilities {
  bluetoothSupported: boolean;
  bluetoothEnabled: boolean;
  /** Some devices can scan but not advertise. That is a degraded mesh node. */
  advertisingSupported: boolean;
  /** BLE 5: a whole packet fits in one frame instead of six. */
  extendedAdvertisingSupported: boolean;
  /** Real usable bytes per frame, read off the adapter — never assumed. */
  maxPayloadBytes: number;
  missingPermissions: string[];
}

export interface BleFrameEvent {
  /** base64 of the manufacturer-data payload, magic byte already stripped. */
  payload: string;
  rssi: number;
  timestamp: number;
}

export interface BleStateEvent {
  state: string;
  detail: string | null;
}

interface VoxMeshNative {
  getCapabilities(): Promise<BleCapabilities>;
  startAdvertising(manufacturerId: number, serviceUuid: string): Promise<boolean>;
  setPayload(payloadBase64: string): Promise<boolean>;
  stopAdvertising(): Promise<boolean>;
  startScanning(manufacturerId: number): Promise<boolean>;
  stopScanning(): Promise<boolean>;
}

const native = NativeModules.VoxMesh as VoxMeshNative | undefined;

export const isMeshLinked = native !== undefined;

const emitter = native ? new NativeEventEmitter(NativeModules.VoxMesh) : null;

const UNLINKED: BleCapabilities = {
  bluetoothSupported: false,
  bluetoothEnabled: false,
  advertisingSupported: false,
  extendedAdvertisingSupported: false,
  maxPayloadBytes: 0,
  missingPermissions: [],
};

export async function getCapabilities(): Promise<BleCapabilities> {
  if (!native) return UNLINKED;
  try {
    return await native.getCapabilities();
  } catch {
    return UNLINKED;
  }
}

export function startAdvertising(
  manufacturerId: number,
  serviceUuid: string,
): Promise<boolean> {
  if (!native) return Promise.reject(new Error('VoxMesh is not linked'));
  return native.startAdvertising(manufacturerId, serviceUuid);
}

export function setPayload(payloadBase64: string): Promise<boolean> {
  if (!native) return Promise.reject(new Error('VoxMesh is not linked'));
  return native.setPayload(payloadBase64);
}

export function stopAdvertising(): Promise<boolean> {
  if (!native) return Promise.resolve(true);
  return native.stopAdvertising();
}

export function startScanning(manufacturerId: number): Promise<boolean> {
  if (!native) return Promise.reject(new Error('VoxMesh is not linked'));
  return native.startScanning(manufacturerId);
}

export function stopScanning(): Promise<boolean> {
  if (!native) return Promise.resolve(true);
  return native.stopScanning();
}

export function onFrame(
  handler: (event: BleFrameEvent) => void,
): EmitterSubscription | null {
  return emitter?.addListener('VoxMeshFrame', handler) ?? null;
}

export function onState(
  handler: (event: BleStateEvent) => void,
): EmitterSubscription | null {
  return emitter?.addListener('VoxMeshState', handler) ?? null;
}
