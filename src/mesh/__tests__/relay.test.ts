import { RelayState } from '../relay';
import { createPacket } from '../packet';

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
