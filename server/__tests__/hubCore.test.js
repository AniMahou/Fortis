'use strict';

const {HubCore} = require('../hubCore');

/** A client that records what it was sent. */
function fakeClient() {
  const received = [];
  return {received, send: data => received.push(data)};
}

/** Valid base64, which is the only thing the hub forwards. */
const FRAME = 'aGVsbG8gbWVzaA==';

describe('HubCore', () => {
  it('passes a frame to everyone except the sender', () => {
    const hub = new HubCore();
    const a = fakeClient();
    const b = fakeClient();
    const c = fakeClient();
    const idA = hub.add(a);
    hub.add(b);
    hub.add(c);

    const delivered = hub.broadcast(idA, FRAME);

    expect(delivered).toBe(2);
    expect(a.received).toEqual([]);
    expect(b.received).toEqual([FRAME]);
    expect(c.received).toEqual([FRAME]);
  });

  it('reports zero when nobody else is connected', () => {
    const hub = new HubCore();
    const idA = hub.add(fakeClient());
    expect(hub.broadcast(idA, FRAME)).toBe(0);
  });

  it('stops sending to a client that has disconnected', () => {
    const hub = new HubCore();
    const idA = hub.add(fakeClient());
    hub.add(fakeClient());
    hub.remove(idA);

    expect(hub.clientCount).toBe(1);
  });

  it('keeps going when one socket throws mid-broadcast', () => {
    // Normal on a flaky hotspot: a client dies between the readyState check
    // and the write. One bad socket must not stop the packet reaching others.
    const hub = new HubCore();
    const sender = hub.add(fakeClient());
    hub.add({
      send: () => {
        throw new Error('EPIPE');
      },
    });
    const healthy = fakeClient();
    hub.add(healthy);

    const delivered = hub.broadcast(sender, FRAME);

    expect(delivered).toBe(1);
    expect(healthy.received).toEqual([FRAME]);
    // The dead client was dropped rather than retried forever.
    expect(hub.clientCount).toBe(2);
  });

  describe('rejecting junk', () => {
    // The hub is reachable by anything on the hotspot, including a stray
    // browser tab or a port scanner. Junk it forwards is junk every phone
    // then has to parse.
    it.each([
      ['an empty frame', ''],
      ['a non-string', {not: 'a string'}],
      ['non-base64 text', 'GET / HTTP/1.1'],
      ['base64 with junk mixed in', 'aGVs*bG8='],
    ])('rejects %s', (_label, frame) => {
      const hub = new HubCore();
      const sender = hub.add(fakeClient());
      const other = fakeClient();
      hub.add(other);

      expect(hub.broadcast(sender, frame)).toBe(0);
      expect(other.received).toEqual([]);
      expect(hub.stats.rejected).toBe(1);
    });

    it('rejects an oversized frame', () => {
      const hub = new HubCore({maxFrameBytes: 100});
      const sender = hub.add(fakeClient());
      const other = fakeClient();
      hub.add(other);

      expect(hub.broadcast(sender, 'A'.repeat(200))).toBe(0);
      expect(other.received).toEqual([]);
    });
  });

  describe('capacity', () => {
    it('refuses connections past the limit rather than growing forever', () => {
      // The hub may be running on a phone that is also hosting the hotspot.
      const hub = new HubCore({maxClients: 3});

      expect(hub.add(fakeClient())).not.toBeNull();
      expect(hub.add(fakeClient())).not.toBeNull();
      expect(hub.add(fakeClient())).not.toBeNull();
      expect(hub.add(fakeClient())).toBeNull();
      expect(hub.clientCount).toBe(3);
    });

    it('frees a slot when a client leaves', () => {
      const hub = new HubCore({maxClients: 2});
      const idA = hub.add(fakeClient());
      hub.add(fakeClient());
      expect(hub.add(fakeClient())).toBeNull();

      hub.remove(idA);

      expect(hub.add(fakeClient())).not.toBeNull();
    });
  });

  it('never inspects frame contents', () => {
    // The hub holds nobody's keys and cannot read packets. Anyone who seizes
    // the machine learns traffic timing and nothing else.
    const hub = new HubCore();
    const sender = hub.add(fakeClient());
    const receiver = fakeClient();
    hub.add(receiver);

    hub.broadcast(sender, FRAME);

    expect(receiver.received[0]).toBe(FRAME);
  });

  it('tracks counters for the operator display', () => {
    const hub = new HubCore();
    const sender = hub.add(fakeClient());
    hub.add(fakeClient());

    hub.broadcast(sender, FRAME);
    hub.broadcast(sender, FRAME);
    hub.broadcast(sender, 'not base64!');

    expect(hub.stats.relayed).toBe(2);
    expect(hub.stats.rejected).toBe(1);
    expect(hub.stats.connected).toBe(2);
  });
});
