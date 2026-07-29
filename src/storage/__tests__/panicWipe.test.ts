import {loadOrCreateKeyPair} from '../../crypto/keys';
import {MemoryBackend} from '../memoryBackend';
import {loadOrCreateMasterKey} from '../masterKey';
import {panicWipe} from '../panicWipe';
import {STORAGE_KEYS, type KeyWrapper} from '../types';
import {VAULT_KEYS, asKeyStorage} from '../vault';

class FakeKeystore implements KeyWrapper {
  aliasExists = false;

  async isAvailable() {
    return true;
  }
  async wrapKey(keyBase64: string) {
    this.aliasExists = true;
    return `wrapped:${keyBase64}`;
  }
  async unwrapKey(blob: string) {
    if (!this.aliasExists) throw new Error('KEY_DESTROYED');
    return blob.replace(/^wrapped:/, '');
  }
  async destroyWrappingKey() {
    this.aliasExists = false;
  }
  async hasWrappingKey() {
    return this.aliasExists;
  }
}

/** A device mid-use: identity, messages, map pins, the lot. */
async function seedPopulatedDevice() {
  const bootstrap = new MemoryBackend();
  const vault = new MemoryBackend();
  const wrapper = new FakeKeystore();

  await loadOrCreateMasterKey(bootstrap, wrapper);
  loadOrCreateKeyPair(asKeyStorage(vault));

  vault.set(VAULT_KEYS.nickname, 'Citizen-7X9');
  vault.set(VAULT_KEYS.onboardingComplete, 'true');
  vault.set(
    VAULT_KEYS.messages,
    JSON.stringify([{id: 'm1', text: 'medical camp at gate 3'}]),
  );
  vault.set(
    VAULT_KEYS.dangerPins,
    JSON.stringify([{id: 'p1', lat: 23.7, lng: 90.4}]),
  );

  return {bootstrap, vault, wrapper};
}

describe('panicWipe', () => {
  it('leaves nothing behind on a fully populated device', async () => {
    const {bootstrap, vault, wrapper} = await seedPopulatedDevice();
    expect(vault.size).toBeGreaterThan(0);

    const report = await panicWipe({bootstrap, vault, wrapper});

    expect(report.success).toBe(true);
    expect(report.keyDestroyed).toBe(true);
    expect(report.hardwareKeyDestroyed).toBe(true);
    expect(report.vaultKeysRemaining).toBe(0);
    expect(report.bootstrapKeysRemaining).toBe(0);
    expect(report.errors).toEqual([]);
  });

  it('destroys the device keypair, not just the messages', async () => {
    // CONTEXT.md risk #6: a wipe that removes chats but leaves the keypair
    // still lets someone prove who authored what.
    const {bootstrap, vault, wrapper} = await seedPopulatedDevice();

    await panicWipe({bootstrap, vault, wrapper});

    expect(vault.getString('vox.device.keypair.v1')).toBeUndefined();
  });

  it('destroys the key before clearing data, so an interrupted wipe is still safe', async () => {
    // The ordering guarantee. If clearing the vault blows up halfway, the key
    // must already be gone — otherwise recoverable deleted rows sit next to
    // the key that decrypts them.
    const {bootstrap, wrapper} = await seedPopulatedDevice();
    const order: string[] = [];

    const explodingVault = new MemoryBackend();
    explodingVault.set('secret', 'value');
    explodingVault.clearAll = () => {
      order.push('clearVault');
      throw new Error('storage died mid-wipe');
    };

    const trackingWrapper: KeyWrapper = {
      ...wrapper,
      isAvailable: () => wrapper.isAvailable(),
      wrapKey: k => wrapper.wrapKey(k),
      unwrapKey: b => wrapper.unwrapKey(b),
      hasWrappingKey: () => wrapper.hasWrappingKey(),
      destroyWrappingKey: async () => {
        order.push('destroyKey');
        await wrapper.destroyWrappingKey();
      },
    };

    const report = await panicWipe({
      bootstrap,
      vault: explodingVault,
      wrapper: trackingWrapper,
    });

    expect(order).toEqual(['destroyKey', 'clearVault']);
    expect(report.keyDestroyed).toBe(true);
    expect(await wrapper.hasWrappingKey()).toBe(false);
    // The wipe is reported as imperfect, but the key is gone regardless.
    expect(report.success).toBe(false);
    expect(report.errors[0]).toContain('storage died mid-wipe');
  });

  it('clears in-memory state too, so nothing is left on screen', async () => {
    const {bootstrap, vault, wrapper} = await seedPopulatedDevice();
    const resetA = jest.fn();
    const resetB = jest.fn();

    await panicWipe({
      bootstrap,
      vault,
      wrapper,
      memoryResets: [resetA, resetB],
    });

    expect(resetA).toHaveBeenCalledTimes(1);
    expect(resetB).toHaveBeenCalledTimes(1);
  });

  it('runs every reset even when one of them throws', async () => {
    const {bootstrap, vault, wrapper} = await seedPopulatedDevice();
    const survivor = jest.fn();

    const report = await panicWipe({
      bootstrap,
      vault,
      wrapper,
      memoryResets: [
        () => {
          throw new Error('store already unmounted');
        },
        survivor,
      ],
    });

    expect(survivor).toHaveBeenCalledTimes(1);
    expect(report.errors[0]).toContain('store already unmounted');
  });

  it('works on a device with no hardware keystore', async () => {
    const bootstrap = new MemoryBackend();
    const vault = new MemoryBackend();
    await loadOrCreateMasterKey(bootstrap, null);
    vault.set(VAULT_KEYS.nickname, 'Citizen-1');

    const report = await panicWipe({bootstrap, vault, wrapper: null});

    expect(report.success).toBe(true);
    expect(report.keyDestroyed).toBe(true);
    expect(report.hardwareKeyDestroyed).toBe(false);
    expect(bootstrap.getString(STORAGE_KEYS.plainMasterKey)).toBeUndefined();
  });

  it('produces a genuinely new identity afterwards', async () => {
    // The check CONTEXT.md Phase 4 asks for: wipe, relaunch, confirm the
    // fingerprint is different.
    const {bootstrap, vault, wrapper} = await seedPopulatedDevice();
    const before = loadOrCreateKeyPair(asKeyStorage(vault));

    await panicWipe({bootstrap, vault, wrapper});

    const afterMaster = await loadOrCreateMasterKey(bootstrap, wrapper);
    const after = loadOrCreateKeyPair(asKeyStorage(vault));

    expect(afterMaster.created).toBe(true);
    expect(Array.from(after.publicKey)).not.toEqual(
      Array.from(before.publicKey),
    );
  });

  it('is idempotent — wiping an already-wiped device is not an error', async () => {
    const {bootstrap, vault, wrapper} = await seedPopulatedDevice();

    await panicWipe({bootstrap, vault, wrapper});
    const second = await panicWipe({bootstrap, vault, wrapper});

    expect(second.success).toBe(true);
    expect(second.vaultKeysRemaining).toBe(0);
  });

  it('reports how long it took, for the confirmation screen', async () => {
    const {bootstrap, vault, wrapper} = await seedPopulatedDevice();
    let clock = 1000;
    const now = () => (clock += 5);

    const report = await panicWipe({bootstrap, vault, wrapper}, now);

    expect(report.durationMs).toBeGreaterThan(0);
  });

  it('reports -1 rather than 0 when it cannot verify a store is empty', async () => {
    // A wipe screen claiming "0 records remain" when the count could not
    // actually be read would be a lie of exactly the kind this app cannot
    // afford to tell.
    const bootstrap = new MemoryBackend();
    const vault = new MemoryBackend();
    vault.getAllKeys = () => {
      throw new Error('cannot enumerate');
    };

    const report = await panicWipe({bootstrap, vault, wrapper: null});

    expect(report.vaultKeysRemaining).toBe(-1);
    expect(report.success).toBe(false);
    expect(report.errors.some(e => e.includes('verify'))).toBe(true);
  });
});
