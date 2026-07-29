/**
 * Signing for mesh packets. Every packet's canonical form (see
 * `mesh/packet.ts`) gets signed here before broadcast, and every relaying
 * phone can verify it without needing to trust the peer that handed it to
 * them — the signature is checked against the *original sender's* public
 * key, not the relay's.
 */

import nacl from 'tweetnacl';
import { decodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

export function sign(message: string, secretKey: Uint8Array): string {
  const signature = nacl.sign.detached(decodeUTF8(message), secretKey);
  return encodeBase64(signature);
}

/**
 * Never throws — a malformed signature from a buggy or hostile peer must
 * fail verification cleanly, not crash the relay loop that's processing
 * packets from strangers' phones in real time.
 */
export function verify(
  message: string,
  signatureB64: string,
  publicKey: Uint8Array
): boolean {
  try {
    const signature = decodeBase64(signatureB64);
    return nacl.sign.detached.verify(decodeUTF8(message), signature, publicKey);
  } catch {
    return false;
  }
}
