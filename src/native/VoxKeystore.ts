/**
 * JS binding for VoxKeystoreModule (android/.../VoxKeystoreModule.kt).
 *
 * Every method is written to degrade rather than throw. A device without a
 * usable Keystore — an emulator, an unusual OEM build, a very old handset —
 * must still be able to run VOX, with the weaker protection level reported
 * honestly instead of the app refusing to start.
 */

import {NativeModules} from 'react-native';
import type {KeyWrapper} from '../storage/types';

interface VoxKeystoreNative {
  isAvailable(): Promise<boolean>;
  wrapKey(keyBase64: string): Promise<string>;
  unwrapKey(blobBase64: string): Promise<string>;
  destroyWrappingKey(): Promise<boolean>;
  hasWrappingKey(): Promise<boolean>;
}

const native = NativeModules.VoxKeystore as VoxKeystoreNative | undefined;

export const voxKeystore: KeyWrapper = {
  async isAvailable() {
    if (!native) return false;
    try {
      return await native.isAvailable();
    } catch {
      return false;
    }
  },

  async wrapKey(keyBase64) {
    if (!native) throw new Error('VoxKeystore native module is unavailable');
    return native.wrapKey(keyBase64);
  },

  async unwrapKey(blobBase64) {
    if (!native) throw new Error('VoxKeystore native module is unavailable');
    return native.unwrapKey(blobBase64);
  },

  async destroyWrappingKey() {
    if (!native) {
      // Nothing to destroy is not a failure — it is the desired end state.
      // Throwing here would make panic wipe report failure on a device that
      // never had a hardware key in the first place, which would be alarming
      // and wrong.
      return;
    }
    await native.destroyWrappingKey();
  },

  async hasWrappingKey() {
    if (!native) return false;
    try {
      return await native.hasWrappingKey();
    } catch {
      return false;
    }
  },
};

/** True when the native module is present at all. */
export const isKeystoreLinked = native !== undefined;
