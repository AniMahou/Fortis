import {loadOrCreateKeyPair, publicKeyFingerprint} from '../../crypto/keys';
import {MemoryBackend} from '../memoryBackend';
import {VAULT_KEYS, Vault, asKeyStorage} from '../vault';

describe('Vault', () => {
  it('round-trips strings and booleans', () => {
    const vault = new Vault(new MemoryBackend());

    vault.setString(VAULT_KEYS.nickname, 'Citizen-7X9');
    vault.setBoolean(VAULT_KEYS.onboardingComplete, true);

    expect(vault.getString(VAULT_KEYS.nickname)).toBe('Citizen-7X9');
    expect(vault.getBoolean(VAULT_KEYS.onboardingComplete)).toBe(true);
  });

  it('treats a missing boolean as false', () => {
    const vault = new Vault(new MemoryBackend());
    expect(vault.getBoolean(VAULT_KEYS.onboardingComplete)).toBe(false);
  });

  it('round-trips JSON', () => {
    const vault = new Vault(new MemoryBackend());
    const pins = [{id: 'p1', lat: 23.7808, lng: 90.4142, kind: 'tear_gas'}];

    vault.setJSON(VAULT_KEYS.dangerPins, pins);

    expect(vault.getJSON(VAULT_KEYS.dangerPins, [])).toEqual(pins);
  });

  it('returns the fallback for a missing key', () => {
    const vault = new Vault(new MemoryBackend());
    expect(vault.getJSON(VAULT_KEYS.messages, ['default'])).toEqual(['default']);
  });

  it('recovers from corrupt JSON instead of throwing', () => {
    // Corrupt persisted state must never stop the app from starting. Someone
    // reaching for VOX is not in a position to troubleshoot it.
    const backend = new MemoryBackend();
    backend.set(VAULT_KEYS.messages, '{"truncated":');
    const vault = new Vault(backend);

    expect(vault.getJSON(VAULT_KEYS.messages, [])).toEqual([]);
    // And the corrupt value is dropped, so it cannot fail again next launch.
    expect(backend.getString(VAULT_KEYS.messages)).toBeUndefined();
  });
});

describe('asKeyStorage', () => {
  it('adapts a backend to the shape crypto/keys.ts expects', () => {
    const backend = new MemoryBackend();
    const storage = asKeyStorage(backend);

    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');

    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
  });

  it('returns null, not undefined, for a missing key', () => {
    // crypto/keys.ts branches on `if (existing)`, so undefined would work by
    // accident — but its KeyStorage contract says null, and a future strict
    // check there should not be able to break identity loading.
    expect(asKeyStorage(new MemoryBackend()).getItem('nope')).toBeNull();
  });

  it('persists a device keypair across simulated launches', () => {
    const backend = new MemoryBackend();

    const first = loadOrCreateKeyPair(asKeyStorage(backend));
    const second = loadOrCreateKeyPair(asKeyStorage(backend));

    expect(publicKeyFingerprint(second.publicKey)).toBe(
      publicKeyFingerprint(first.publicKey),
    );
  });
});
