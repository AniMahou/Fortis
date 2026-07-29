import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import { sign, verify } from '../../crypto/sign';
import { RelayState } from '../relay';
import { MAX_TTL, canonicalize, createPacket } from '../packet';

const fakeSign = (data: string) => `SIG(${data.length})`;

function makePacket(id: string, ttl = 3) {
  return createPacket({
    type: 'text',
    senderId: 'sender-1',
    payload: { message: 'hello mesh' },
    sign: fakeSign,
    id,
    ttl,
  });
}

describe('RelayState.handleIncoming', () => {
  it('displays and rebroadcasts a packet seen for the first time', () => {
    const state = new RelayState();
    const decision = state.handleIncoming(makePacket('pkt-1', 3));

    expect(decision.shouldDisplay).toBe(true);
    expect(decision.shouldRebroadcast).toBe(true);
    expect(decision.packetToSend?.ttl).toBe(2); // decremented before resend
  });

  it('never rebroadcasts or re-displays a duplicate packet id', () => {
    const state = new RelayState();
    const packet = makePacket('pkt-2', 3);

    state.handleIncoming(packet); // first time
    const secondTime = state.handleIncoming(packet); // heard again from another peer

    expect(secondTime.shouldDisplay).toBe(false);
    expect(secondTime.shouldRebroadcast).toBe(false);
    expect(secondTime.packetToSend).toBeUndefined();
  });

  it('this dedupe check is what prevents a rebroadcast storm: 5 peers hearing the same packet only ever produces one rebroadcast decision', () => {
    const state = new RelayState();
    const packet = makePacket('pkt-storm', 3);

    const decisions = Array.from({ length: 5 }, () =>
      state.handleIncoming(packet)
    );
    const rebroadcastCount = decisions.filter((d) => d.shouldRebroadcast).length;

    expect(rebroadcastCount).toBe(1);
  });

  it('still displays a packet that has run out of hops, but does not rebroadcast it', () => {
    const state = new RelayState();
    // ttl 1 -> decremented to 0 -> expired
    const decision = state.handleIncoming(makePacket('pkt-3', 1));

    expect(decision.shouldDisplay).toBe(true);
    expect(decision.shouldRebroadcast).toBe(false);
    expect(decision.packetToSend).toBeUndefined();
  });

  it('forgets a packet id after seenTtlMs has elapsed, allowing it to be treated as new again', () => {
    const state = new RelayState(1000); // 1s memory window
    const packet = makePacket('pkt-4', 3);

    const first = state.handleIncoming(packet, 0);
    expect(first.shouldDisplay).toBe(true);

    const withinWindow = state.handleIncoming(packet, 500);
    expect(withinWindow.shouldDisplay).toBe(false); // still remembered

    const afterWindow = state.handleIncoming(packet, 2000);
    expect(afterWindow.shouldDisplay).toBe(true); // forgotten, treated as new
  });

  it('reset() clears all memory, e.g. for panic wipe', () => {
    const state = new RelayState();
    state.handleIncoming(makePacket('pkt-5', 3));
    expect(state.seenCount).toBe(1);

    state.reset();
    expect(state.seenCount).toBe(0);
  });

  it('tracks multiple distinct packets independently', () => {
    const state = new RelayState();
    state.handleIncoming(makePacket('pkt-a', 3));
    state.handleIncoming(makePacket('pkt-b', 3));
    state.handleIncoming(makePacket('pkt-a', 3)); // duplicate of the first

    expect(state.seenCount).toBe(2);
  });
});

describe('signatures survive relaying', () => {
  // Regression test for a bug that made multi-hop relay impossible.
  //
  // `canonicalize` used to include `ttl`, and `decrementTtl` changes `ttl` on
  // every hop — so a packet verified at its origin and then failed
  // verification at every node after the first. The mesh would have silently
  // degraded to a single-hop broadcast, and the demo's headline feature (a
  // message hopping with a visible hop count) could never have shown more
  // than one hop.
  //
  // If this fails, check whether `ttl` has crept back into `canonicalize`.
  it('a packet still verifies after being relayed the full TTL', () => {
    const keyPair = nacl.sign.keyPair();
    const senderId = encodeBase64(keyPair.publicKey);

    let current = createPacket({
      type: 'text',
      senderId,
      payload: { text: 'medical camp at gate 3' },
      sign: canonical => sign(canonical, keyPair.secretKey),
      id: 'hop-test',
      ttl: MAX_TTL,
      timestamp: 1_722_268_800_000,
    });

    const verifyPacket = (packet: typeof current) => {
      const { signature, ...unsigned } = packet;
      return verify(canonicalize(unsigned), signature, keyPair.publicKey);
    };

    expect(verifyPacket(current)).toBe(true);

    // Walk it across a chain of relays, each a fresh node with its own state.
    let hops = 0;
    for (let node = 0; node < MAX_TTL + 2; node++) {
      const decision = new RelayState().handleIncoming(current);
      expect(decision.shouldDisplay).toBe(true);
      if (!decision.shouldRebroadcast || !decision.packetToSend) break;
      current = decision.packetToSend;
      hops++;
      expect(verifyPacket(current)).toBe(true);
    }

    // It travelled, and it was still verifiable the whole way.
    expect(hops).toBe(MAX_TTL - 1);
    expect(verifyPacket(current)).toBe(true);
  });
});
