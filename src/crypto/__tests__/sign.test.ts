import { sign, verify } from '../sign';
import { generateKeyPair } from '../keys';

describe('sign / verify', () => {
  it('a valid signature verifies true against the correct public key', () => {
    const { publicKey, secretKey } = generateKeyPair();
    const message = 'vox mesh packet payload';

    const signature = sign(message, secretKey);

    expect(verify(message, signature, publicKey)).toBe(true);
  });

  it('rejects a signature if the message was tampered with after signing', () => {
    const { publicKey, secretKey } = generateKeyPair();
    const signature = sign('original message', secretKey);

    expect(verify('tampered message', signature, publicKey)).toBe(false);
  });

  it('rejects a signature checked against the wrong public key', () => {
    const signerA = generateKeyPair();
    const signerB = generateKeyPair();
    const message = 'who actually sent this?';

    const signature = sign(message, signerA.secretKey);

    expect(verify(message, signature, signerB.publicKey)).toBe(false);
  });

  it('never throws on a garbage signature string — fails closed instead', () => {
    const { publicKey } = generateKeyPair();
    expect(() => verify('some message', 'not-valid-base64!!', publicKey)).not.toThrow();
    expect(verify('some message', 'not-valid-base64!!', publicKey)).toBe(false);
  });

  it('is deterministic: signing the same message with the same key twice gives the same signature', () => {
    const { secretKey } = generateKeyPair();
    const a = sign('repeatable message', secretKey);
    const b = sign('repeatable message', secretKey);
    expect(a).toBe(b);
  });
});
