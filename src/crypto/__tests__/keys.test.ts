import {
  generateKeyPair,
  serializeKeyPair,
  deserializeKeyPair,
  loadOrCreateKeyPair,
  destroyKeyPair,
  publicKeyFingerprint,
  KEYPAIR_STORAGE_KEY,
  KeyStorage,
  CorruptKeyStorageError,
} from '../keys';

/** Minimal in-memory stand-in for MMKV/AsyncStorage, for tests only. */
class MemoryStorage implements KeyStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe('generateKeyPair', () => {
  it('produces an Ed25519-sized keypair (32-byte public, 64-byte secret)', () => {
    const kp = generateKeyPair();
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(64);
  });

  it('produces a different keypair every call', () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    expect(publicKeyFingerprint(a.publicKey)).not.toBe(
      publicKeyFingerprint(b.publicKey)
    );
  });
});

describe('serializeKeyPair / deserializeKeyPair', () => {
  it('round-trips to an identical keypair', () => {
    const kp = generateKeyPair();
    const restored = deserializeKeyPair(serializeKeyPair(kp));
    expect(restored.publicKey).toEqual(kp.publicKey);
    expect(restored.secretKey).toEqual(kp.secretKey);
  });

  it('throws CorruptKeyStorageError on garbage input', () => {
    expect(() => deserializeKeyPair('not json')).toThrow(CorruptKeyStorageError);
  });

  it('throws CorruptKeyStorageError when fields are missing', () => {
    expect(() => deserializeKeyPair(JSON.stringify({ publicKey: 'x' }))).toThrow(
      CorruptKeyStorageError
    );
  });
});

describe('loadOrCreateKeyPair', () => {
  it('generates and persists a new keypair on first launch (empty storage)', () => {
    const storage = new MemoryStorage();
    expect(storage.getItem(KEYPAIR_STORAGE_KEY)).toBeNull();

    const kp = loadOrCreateKeyPair(storage);

    expect(kp.publicKey.length).toBe(32);
    expect(storage.getItem(KEYPAIR_STORAGE_KEY)).not.toBeNull();
  });

  it('returns the SAME keypair on subsequent calls instead of regenerating', () => {
    const storage = new MemoryStorage();
    const first = loadOrCreateKeyPair(storage);
    const second = loadOrCreateKeyPair(storage);

    expect(second.publicKey).toEqual(first.publicKey);
    expect(second.secretKey).toEqual(first.secretKey);
  });

  it('regenerates gracefully if the stored value is corrupted, rather than crashing startup', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEYPAIR_STORAGE_KEY, '{{not valid json');

    const kp = loadOrCreateKeyPair(storage);

    expect(kp.publicKey.length).toBe(32);
    // and it should have overwritten the corrupt entry with a good one
    expect(() => deserializeKeyPair(storage.getItem(KEYPAIR_STORAGE_KEY)!)).not.toThrow();
  });
});

describe('destroyKeyPair (panic wipe target)', () => {
  it('removes the stored keypair entirely', () => {
    const storage = new MemoryStorage();
    loadOrCreateKeyPair(storage);
    expect(storage.getItem(KEYPAIR_STORAGE_KEY)).not.toBeNull();

    destroyKeyPair(storage);

    expect(storage.getItem(KEYPAIR_STORAGE_KEY)).toBeNull();
  });

  it('a fresh, unrelated keypair is generated after destroy + reload', () => {
    const storage = new MemoryStorage();
    const before = loadOrCreateKeyPair(storage);

    destroyKeyPair(storage);
    const after = loadOrCreateKeyPair(storage);

    expect(publicKeyFingerprint(after.publicKey)).not.toBe(
      publicKeyFingerprint(before.publicKey)
    );
  });
});

describe('publicKeyFingerprint', () => {
  it('is deterministic for the same key', () => {
    const kp = generateKeyPair();
    expect(publicKeyFingerprint(kp.publicKey)).toBe(publicKeyFingerprint(kp.publicKey));
  });

  it('is short enough to eyeball-compare on two phone screens', () => {
    const kp = generateKeyPair();
    expect(publicKeyFingerprint(kp.publicKey).length).toBeLessThanOrEqual(12);
  });
});
