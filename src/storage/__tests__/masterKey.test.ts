import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from 'tweetnacl-util';
import {MemoryBackend} from '../memoryBackend';
import {
  MASTER_KEY_BYTES,
  destroyMasterKey,
  loadOrCreateMasterKey,
  readKeyProtection,
} from '../masterKey';
import {STORAGE_KEYS, type KeyWrapper} from '../types';

/**
 * A stand-in for the Android Keystore that behaves like the real thing in the
 * ways that matter: the wrapped blob does not contain the plaintext key, and
 * once the alias is destroyed no previously wrapped blob can be recovered.
 *
 * The obfuscation is a plain XOR — cryptographically worthless, and that is
 * fine, because what is under test is whether `masterKey.ts` ever writes a raw
 * key to storage. A fake that echoed the key back would make that assertion
 * pass no matter what the code did.
 */
class FakeKeystore implements KeyWrapper {
  private aliasExists = false;
  available = true;

  private static readonly PAD = 0x5a;

  private static transform(input: string): string {
    return encodeBase64(
      decodeUTF8(input).map(byte => byte ^ FakeKeystore.PAD),
    );
  }

  private static untransform(input: string): string {
    return encodeUTF8(
      decodeBase64(input).map(byte => byte ^ FakeKeystore.PAD),
    );
  }

  async isAvailable() {
    return this.available;
  }

  async wrapKey(keyBase64: string) {
    this.aliasExists = true;
    return FakeKeystore.transform(keyBase64);
  }

  async unwrapKey(blob: string) {
    if (!this.aliasExists) {
      throw new Error('KEY_DESTROYED');
    }
    const decoded = FakeKeystore.untransform(blob);
    // Round-tripping garbage yields garbage rather than throwing, so the
    // corrupt-blob case needs an explicit shape check — the real Keystore gets
    // this from GCM's authentication tag.
    if (!/^[A-Za-z0-9+/]+=*$/.test(decoded)) {
      throw new Error('UNWRAP_FAILED');
    }
    return decoded;
  }

  async destroyWrappingKey() {
    this.aliasExists = false;
  }

  async hasWrappingKey() {
    return this.aliasExists;
  }
}

/** Deterministic bytes so assertions can name exact values. */
const fixedRandom = (fill: number) => (length: number) =>
  new Uint8Array(length).fill(fill);

describe('loadOrCreateMasterKey', () => {
  describe('with hardware wrapping available', () => {
    it('creates a key, stores only the wrapped form, and reports hardware', async () => {
      const bootstrap = new MemoryBackend();
      const wrapper = new FakeKeystore();

      const result = await loadOrCreateMasterKey(
        bootstrap,
        wrapper,
        fixedRandom(7),
      );

      expect(result.created).toBe(true);
      expect(result.protection).toBe('hardware');
      expect(decodeBase64(result.key)).toHaveLength(MASTER_KEY_BYTES);

      // The raw key must never be written to flash on this path — that is the
      // entire difference between 'hardware' and 'software'.
      expect(bootstrap.getString(STORAGE_KEYS.plainMasterKey)).toBeUndefined();
      const stored = bootstrap.getString(STORAGE_KEYS.wrappedMasterKey);
      expect(stored).toBeDefined();
      expect(stored).not.toContain(result.key.slice(0, 8));
    });

    it('returns the same key on a second launch', async () => {
      const bootstrap = new MemoryBackend();
      const wrapper = new FakeKeystore();

      const first = await loadOrCreateMasterKey(bootstrap, wrapper);
      const second = await loadOrCreateMasterKey(bootstrap, wrapper);

      expect(second.key).toBe(first.key);
      expect(second.created).toBe(false);
      expect(second.protection).toBe('hardware');
    });

    it('starts a clean identity when the wrapping key was destroyed', async () => {
      // The post-panic-wipe path. It must be indistinguishable from a first
      // launch, not an error — the point of the wipe is that nothing survives,
      // including any sign that there was something to survive.
      const bootstrap = new MemoryBackend();
      const wrapper = new FakeKeystore();

      const original = await loadOrCreateMasterKey(bootstrap, wrapper);
      await wrapper.destroyWrappingKey();

      const afterWipe = await loadOrCreateMasterKey(bootstrap, wrapper);

      expect(afterWipe.created).toBe(true);
      expect(afterWipe.key).not.toBe(original.key);
      expect(afterWipe.protection).toBe('hardware');
    });

    it('recovers from a corrupt wrapped blob rather than refusing to start', async () => {
      const bootstrap = new MemoryBackend();
      const wrapper = new FakeKeystore();
      bootstrap.set(STORAGE_KEYS.wrappedMasterKey, 'garbage-not-a-blob');

      const result = await loadOrCreateMasterKey(bootstrap, wrapper);

      expect(result.created).toBe(true);
      expect(result.protection).toBe('hardware');
    });

    it('removes a stale software key once hardware becomes available', async () => {
      // A device that gains Keystore support must not be left with a second,
      // weaker copy of the same secret sitting in flash.
      const bootstrap = new MemoryBackend();
      bootstrap.set(STORAGE_KEYS.plainMasterKey, 'old-software-key');

      await loadOrCreateMasterKey(bootstrap, new FakeKeystore());

      expect(bootstrap.getString(STORAGE_KEYS.plainMasterKey)).toBeUndefined();
    });
  });

  describe('without hardware wrapping', () => {
    it('falls back to software and says so', async () => {
      const bootstrap = new MemoryBackend();

      const result = await loadOrCreateMasterKey(
        bootstrap,
        null,
        fixedRandom(3),
      );

      expect(result.protection).toBe('software');
      expect(result.created).toBe(true);
      expect(bootstrap.getString(STORAGE_KEYS.plainMasterKey)).toBe(result.key);
      expect(readKeyProtection(bootstrap)).toBe('software');
    });

    it('treats an unavailable wrapper the same as no wrapper', async () => {
      const bootstrap = new MemoryBackend();
      const wrapper = new FakeKeystore();
      wrapper.available = false;

      const result = await loadOrCreateMasterKey(bootstrap, wrapper);

      expect(result.protection).toBe('software');
    });

    it('reuses the stored key across launches', async () => {
      const bootstrap = new MemoryBackend();

      const first = await loadOrCreateMasterKey(bootstrap, null);
      const second = await loadOrCreateMasterKey(bootstrap, null);

      expect(second.key).toBe(first.key);
      expect(second.created).toBe(false);
    });
  });

  it('generates a different key per install', async () => {
    // Uses the real CSPRNG rather than the fixed generator, because "two fresh
    // installs get different identities" is the property that makes the app
    // anonymous, and it depends on that randomness being real.
    const a = await loadOrCreateMasterKey(new MemoryBackend(), null);
    const b = await loadOrCreateMasterKey(new MemoryBackend(), null);
    expect(a.key).not.toBe(b.key);
  });
});

describe('destroyMasterKey', () => {
  it('removes every copy and the hardware alias', async () => {
    const bootstrap = new MemoryBackend();
    const wrapper = new FakeKeystore();
    await loadOrCreateMasterKey(bootstrap, wrapper);

    const result = await destroyMasterKey(bootstrap, wrapper);

    expect(result.errors).toEqual([]);
    expect(result.hardwareKeyDestroyed).toBe(true);
    expect(await wrapper.hasWrappingKey()).toBe(false);
    expect(bootstrap.getString(STORAGE_KEYS.wrappedMasterKey)).toBeUndefined();
    expect(bootstrap.getString(STORAGE_KEYS.plainMasterKey)).toBeUndefined();
    expect(bootstrap.getString(STORAGE_KEYS.keyProtection)).toBeUndefined();
  });

  it('still deletes stored copies when the Keystore call fails', async () => {
    // A wipe must not be abandoned because one step failed. Removing what we
    // can reach is strictly better than removing nothing.
    const bootstrap = new MemoryBackend();
    await loadOrCreateMasterKey(bootstrap, null);
    const brokenWrapper: KeyWrapper = {
      isAvailable: async () => true,
      wrapKey: async () => 'x',
      unwrapKey: async () => 'x',
      destroyWrappingKey: async () => {
        throw new Error('TEE unreachable');
      },
      hasWrappingKey: async () => true,
    };

    const result = await destroyMasterKey(bootstrap, brokenWrapper);

    expect(result.hardwareKeyDestroyed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('TEE unreachable');
    expect(bootstrap.getString(STORAGE_KEYS.plainMasterKey)).toBeUndefined();
  });

  it('is safe to run on a device that has nothing stored', async () => {
    const result = await destroyMasterKey(new MemoryBackend(), null);
    expect(result.errors).toEqual([]);
  });
});
