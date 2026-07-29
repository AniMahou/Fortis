/**
 * Runtime permissions, on React Native's built-in PermissionsAndroid.
 *
 * No `react-native-permissions` — the platform API covers everything VOX asks
 * for, and one fewer native dependency is one fewer thing that has to compile
 * (docs/DECISIONS.md D3).
 *
 * The design rule throughout: **the app must stay usable when a permission is
 * refused.** CONTEXT.md says so explicitly, and it is the right call — someone
 * who declines location should still be able to read the mesh, not face a wall.
 */

import {PermissionsAndroid, Platform, type Permission} from 'react-native';

export interface PermissionState {
  bluetooth: boolean;
  location: boolean;
  /** True when at least the receive side of the mesh can work. */
  meshUsable: boolean;
}

/**
 * Android 12 (API 31) split Bluetooth into scan/advertise/connect. Below that,
 * BLE scanning was gated behind location instead. Both paths are handled
 * because the target audience is not all on new handsets.
 */
function bluetoothPermissions(): Permission[] {
  if (Platform.OS !== 'android') return [];
  if (Number(Platform.Version) >= 31) {
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ];
  }
  return [];
}

const LOCATION: Permission | null =
  Platform.OS === 'android'
    ? PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    : null;

export async function checkPermissions(): Promise<PermissionState> {
  if (Platform.OS !== 'android') {
    return {bluetooth: false, location: false, meshUsable: false};
  }

  const bluetoothChecks = await Promise.all(
    bluetoothPermissions().map(permission =>
      PermissionsAndroid.check(permission),
    ),
  );
  const bluetooth = bluetoothChecks.every(Boolean);
  const location = LOCATION ? await PermissionsAndroid.check(LOCATION) : false;

  return {
    bluetooth,
    location,
    // Android returns no scan results without location, whatever the Bluetooth
    // permissions say — so both are required for the mesh to work at all.
    meshUsable: bluetooth && location,
  };
}

/**
 * Asks for everything the mesh needs, in one prompt sequence.
 *
 * Returns what was actually granted rather than throwing on refusal. A refusal
 * is a legitimate choice, and this app's whole pitch is that it does not demand
 * more than it needs.
 */
export async function requestMeshPermissions(): Promise<PermissionState> {
  if (Platform.OS !== 'android') {
    return {bluetooth: false, location: false, meshUsable: false};
  }

  const requested: Permission[] = [...bluetoothPermissions()];
  if (LOCATION) requested.push(LOCATION);

  try {
    await PermissionsAndroid.requestMultiple(requested);
  } catch {
    // A throw here means the dialog could not be shown at all. Fall through to
    // the check below, which reports the true state either way.
  }

  return checkPermissions();
}

/**
 * A plain-language explanation of what is missing.
 *
 * Written to tell someone what to do, not to scold them for declining.
 */
export function describeMissing(state: PermissionState): string | null {
  if (state.meshUsable) return null;
  if (!state.bluetooth && !state.location) {
    return 'VOX needs Bluetooth and Location to find nearby phones. You can still read anything already received.';
  }
  if (!state.bluetooth) {
    return 'VOX needs Bluetooth permission to reach nearby phones.';
  }
  return 'Android requires Location permission before it will report nearby Bluetooth devices. VOX uses it for that, and to attach a position to an SOS.';
}
