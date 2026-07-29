/**
 * Fan-out logic for the Plan B WiFi hub.
 *
 * Separated from the socket wiring in hub.js so it can be tested without
 * opening a port. This is the whole behaviour of the hub: remember who is
 * connected, and pass each packet to everyone except its sender.
 *
 * What the hub deliberately does NOT do:
 *
 *   - It does not decode packets. It cannot: they are signed and the hub has
 *     nobody's keys. It moves opaque bytes, which is the point — a hub
 *     operator, or anyone who seizes the hub, learns nothing beyond traffic
 *     timing. During a real blackout the machine running this is the single
 *     most seizable object in the network.
 *   - It does not store anything. There is no log and no history, so there is
 *     nothing on it to take.
 *   - It does not apply TTL or de-duplication. Every client hears everything
 *     directly, and the clients' own relay logic handles the rest unchanged.
 */

'use strict';

/** Longest acceptable frame. A VOX packet is ~113-300 bytes; 8KB is generous. */
const MAX_FRAME_BYTES = 8192;

class HubCore {
  constructor(options = {}) {
    /** @type {Map<string, {send: (data: string) => void}>} */
    this.clients = new Map();
    this.maxClients = options.maxClients ?? 64;
    this.maxFrameBytes = options.maxFrameBytes ?? MAX_FRAME_BYTES;
    this.stats = {connected: 0, relayed: 0, rejected: 0};
    this.nextId = 1;
  }

  /**
   * Registers a client. Returns its id, or null when the hub is full — an
   * unbounded client map on a phone hosting the hotspot is a crash waiting to
   * happen at exactly the wrong moment.
   */
  add(client) {
    if (this.clients.size >= this.maxClients) {
      this.stats.rejected += 1;
      return null;
    }
    const id = `c${this.nextId++}`;
    this.clients.set(id, client);
    this.stats.connected = this.clients.size;
    return id;
  }

  remove(id) {
    this.clients.delete(id);
    this.stats.connected = this.clients.size;
  }

  /**
   * Passes one frame to every client except its sender.
   *
   * Returns how many clients it reached, so hub.js can log a count without
   * ever touching the contents.
   */
  broadcast(fromId, frame) {
    if (typeof frame !== 'string' || frame.length === 0) {
      this.stats.rejected += 1;
      return 0;
    }
    if (frame.length > this.maxFrameBytes) {
      this.stats.rejected += 1;
      return 0;
    }
    // Base64 only. Rejecting anything else keeps a stray browser tab or a
    // port scanner from injecting junk that every phone then has to parse.
    if (!/^[A-Za-z0-9+/]+=*$/.test(frame)) {
      this.stats.rejected += 1;
      return 0;
    }

    let delivered = 0;
    for (const [id, client] of this.clients) {
      if (id === fromId) continue;
      try {
        client.send(frame);
        delivered += 1;
      } catch {
        // A client that died between the readyState check and the write is
        // normal on a flaky hotspot. Drop it and keep going — one bad socket
        // must not stop the packet reaching everyone else.
        this.clients.delete(id);
      }
    }
    this.stats.connected = this.clients.size;
    if (delivered > 0) this.stats.relayed += 1;
    return delivered;
  }

  get clientCount() {
    return this.clients.size;
  }
}

module.exports = {HubCore, MAX_FRAME_BYTES};
