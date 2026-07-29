import nacl from 'tweetnacl';
import {encodeBase64} from 'tweetnacl-util';
import {DEFAULT_CONFIG, type VoxConfig} from '../../config/schema';
import {sign} from '../../crypto/sign';
import {LoopbackBus, LoopbackTransport} from '../loopbackTransport';
import {
  MeshService,
  type MeshIdentity,
  type ReceivedPacket,
} from '../meshService';
import {encodePacket} from '../wire';
import {buildTextPacket} from '../payloads';

function makeIdentity(): MeshIdentity {
  const keyPair = nacl.sign.keyPair();
  return {
    senderId: encodeBase64(keyPair.publicKey),
    publicKey: keyPair.publicKey,
    sign: canonical => sign(canonical, keyPair.secretKey),
  };
}

interface Node {
  name: string;
  service: MeshService;
  transport: LoopbackTransport;
  identity: MeshIdentity;
  received: ReceivedPacket[];
  dropped: Array<{reason: string; detail: string}>;
}

async function makeNode(
  name: string,
  bus: LoopbackBus,
  config: Partial<VoxConfig> = {},
): Promise<Node> {
  const identity = makeIdentity();
  const transport = new LoopbackTransport({nodeId: name, bus});
  const service = new MeshService({
    transport,
    identity,
    config: {...DEFAULT_CONFIG, ...config},
    randomBytes: nacl.randomBytes,
  });
  const node: Node = {
    name,
    service,
    transport,
    identity,
    received: [],
    dropped: [],
  };
  service.subscribe({
    onPacket: packet => node.received.push(packet),
    onDropped: (reason, detail) => node.dropped.push({reason, detail}),
  });
  await service.start();
  return node;
}

describe('MeshService', () => {
  let bus: LoopbackBus;

  beforeEach(() => {
    bus = new LoopbackBus();
  });

  describe('direct delivery', () => {
    it('delivers a text message to a node in range', async () => {
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);

      await alice.service.sendText('Medical camp at Gate 3');

      expect(bob.received).toHaveLength(1);
      expect(bob.received[0]!.packet.payload.text).toBe(
        'Medical camp at Gate 3',
      );
      expect(bob.received[0]!.hopCount).toBe(0);
    });

    it('does not deliver a node its own packet', async () => {
      const alice = await makeNode('alice', bus);
      await makeNode('bob', bus);

      await alice.service.sendText('hello');

      expect(alice.received).toHaveLength(0);
    });

    it('carries every packet type over the one transport', async () => {
      // CONTEXT.md's core architectural idea: a phone that can relay a chat
      // message relays an SOS the same way.
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);

      await alice.service.sendText('clear at TSC');
      await alice.service.sendSos({
        lat: 23.7808,
        lng: 90.4142,
        accuracy: 12,
        stale: false,
      });
      await alice.service.sendDanger({
        lat: 23.7381,
        lng: 90.3956,
        kind: 'tear_gas',
        note: 'Shahbagh',
      });
      await alice.service.sendSafe({lat: 23.7, lng: 90.4});

      expect(bob.received.map(r => r.packet.type)).toEqual([
        'text',
        'sos',
        'danger',
        'safe',
      ]);
    });
  });

  describe('multi-hop relay', () => {
    // The behaviour CONTEXT.md Phase 2 calls the most important manual test in
    // the project. The radio itself still needs the hardware spike, but the
    // relay logic riding on it is provable here.
    it('reaches a node out of direct range by hopping', async () => {
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);
      const carol = await makeNode('carol', bus);

      // A —— B —— C, with A and C unable to hear each other.
      bus.disconnect('alice', 'carol');

      await alice.service.sendText('help needed at Gate 3');

      expect(bob.received).toHaveLength(1);
      expect(bob.received[0]!.hopCount).toBe(0);

      expect(carol.received).toHaveLength(1);
      expect(carol.received[0]!.packet.payload.text).toBe(
        'help needed at Gate 3',
      );
      // Carol heard it via Bob — one relay crossed.
      expect(carol.received[0]!.hopCount).toBe(1);
    });

    it('increments the hop count along a chain', async () => {
      const names = ['n0', 'n1', 'n2', 'n3'];
      const nodes: Node[] = [];
      for (const name of names) nodes.push(await makeNode(name, bus));

      // A line: each node hears only its immediate neighbours.
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 2; j < names.length; j++) {
          bus.disconnect(names[i]!, names[j]!);
        }
      }

      await nodes[0]!.service.sendText('relayed');

      expect(nodes[1]!.received[0]!.hopCount).toBe(0);
      expect(nodes[2]!.received[0]!.hopCount).toBe(1);
      expect(nodes[3]!.received[0]!.hopCount).toBe(2);
    });

    it('shows each message exactly once despite the rebroadcast storm', async () => {
      // Five nodes all in range of each other: every one rebroadcasts, so each
      // node hears the same packet from four directions. relay.ts's de-dupe is
      // the only thing stopping this becoming a flood.
      const nodes: Node[] = [];
      for (let i = 0; i < 5; i++) nodes.push(await makeNode(`n${i}`, bus));

      await nodes[0]!.service.sendText('once, please');

      for (const node of nodes.slice(1)) {
        expect(node.received).toHaveLength(1);
      }
      expect(nodes[0]!.received).toHaveLength(0);
    });

    it('stops relaying once the TTL runs out', async () => {
      const names = ['a', 'b', 'c', 'd', 'e', 'f'];
      const nodes: Node[] = [];
      for (const name of names) {
        nodes.push(await makeNode(name, bus, {meshMaxTtl: 3}));
      }
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 2; j < names.length; j++) {
          bus.disconnect(names[i]!, names[j]!);
        }
      }

      await nodes[0]!.service.sendText('fades out');

      // ttl 3: delivered at hop 0, 1 and 2, then the packet dies.
      expect(nodes[1]!.received).toHaveLength(1);
      expect(nodes[2]!.received).toHaveLength(1);
      expect(nodes[3]!.received).toHaveLength(1);
      expect(nodes[4]!.received).toHaveLength(0);
      expect(nodes[5]!.received).toHaveLength(0);
    });
  });

  describe('rejecting bad packets', () => {
    it('drops a packet whose signature does not match', async () => {
      const bob = await makeNode('bob', bus);
      const attacker = new LoopbackTransport({nodeId: 'attacker', bus});
      await attacker.start();

      // Sign with one key, then claim a different identity.
      const realKey = nacl.sign.keyPair();
      const victimKey = nacl.sign.keyPair();
      const forged = buildTextPacket('the bridge is safe, go now', {
        senderId: encodeBase64(victimKey.publicKey),
        id: 'deadbeefdeadbeef',
        sign: canonical => sign(canonical, realKey.secretKey),
      });

      await attacker.send(encodePacket(forged));

      expect(bob.received).toHaveLength(0);
      expect(bob.dropped.map(d => d.reason)).toContain('bad_signature');
    });

    it('drops undecodable noise without crashing the relay loop', async () => {
      const bob = await makeNode('bob', bus);
      const noise = new LoopbackTransport({nodeId: 'noise', bus});
      await noise.start();

      await noise.send(new Uint8Array([1, 2, 3]));
      await noise.send(new Uint8Array(200).fill(0xff));

      expect(bob.received).toHaveLength(0);
      expect(bob.dropped.filter(d => d.reason === 'malformed')).toHaveLength(2);

      // Still working afterwards.
      const alice = await makeNode('alice', bus);
      await alice.service.sendText('still alive');
      expect(bob.received).toHaveLength(1);
    });

    it('does not let a forged packet burn a real packet id', async () => {
      // Why signatures are checked before de-duplication. If they were not, an
      // attacker could claim the ids of real messages and have them silently
      // discarded as duplicates when they actually arrived.
      const bob = await makeNode('bob', bus);
      const alice = await makeNode('alice', bus);
      const attacker = new LoopbackTransport({nodeId: 'attacker', bus});
      await attacker.start();

      const wrongKey = nacl.sign.keyPair();
      const forged = buildTextPacket('poison', {
        senderId: alice.identity.senderId,
        id: 'aaaaaaaabbbbbbbb',
        sign: canonical => sign(canonical, wrongKey.secretKey),
      });
      await attacker.send(encodePacket(forged));
      expect(bob.received).toHaveLength(0);

      // The real message with that id still gets through.
      const genuine = buildTextPacket('the real message', {
        senderId: alice.identity.senderId,
        id: 'aaaaaaaabbbbbbbb',
        sign: canonical => alice.identity.sign(canonical),
      });
      await alice.transport.send(encodePacket(genuine));

      expect(bob.received).toHaveLength(1);
      expect(bob.received[0]!.packet.payload.text).toBe('the real message');
    });

    it('clamps an inflated TTL to this device s own maximum', async () => {
      // ttl is not covered by the signature — it cannot be, every relay
      // changes it — so a hostile node can inflate it to keep a packet
      // bouncing far longer than its sender intended.
      const bob = await makeNode('bob', bus, {meshMaxTtl: 5});
      const attacker = new LoopbackTransport({nodeId: 'attacker', bus});
      await attacker.start();

      const key = nacl.sign.keyPair();
      const flood = buildTextPacket('bounce forever', {
        senderId: encodeBase64(key.publicKey),
        id: '1111111122222222',
        sign: canonical => sign(canonical, key.secretKey),
        ttl: 250,
      });
      await attacker.send(encodePacket(flood));

      expect(bob.received).toHaveLength(1);
      expect(bob.received[0]!.packet.ttl).toBe(5);
      expect(bob.received[0]!.hopCount).toBe(0);
    });
  });

  describe('peer tracking', () => {
    it('counts only peers actually heard from', async () => {
      // CONTEXT.md is explicit that the mockup's "47 DEVICES" is a
      // placeholder, not a target. Two phones in range means two.
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);
      const carol = await makeNode('carol', bus);

      expect(bob.service.activePeers()).toHaveLength(0);

      await alice.service.sendText('one');
      expect(bob.service.activePeers()).toHaveLength(1);

      await carol.service.sendText('two');
      expect(bob.service.activePeers()).toHaveLength(2);
      expect(bob.service.activePeers().map(p => p.senderId).sort()).toEqual(
        [alice.identity.senderId, carol.identity.senderId].sort(),
      );
    });

    it('forgets a peer that has gone quiet', async () => {
      let clock = 1_000_000;
      const identity = makeIdentity();
      const transport = new LoopbackTransport({nodeId: 'bob', bus});
      const service = new MeshService({
        transport,
        identity,
        config: {...DEFAULT_CONFIG, peerTimeoutMs: 60_000},
        randomBytes: nacl.randomBytes,
        now: () => clock,
      });
      await service.start();

      const alice = await makeNode('alice', bus);
      await alice.service.sendText('still here');
      expect(service.activePeers()).toHaveLength(1);

      clock += 61_000;
      expect(service.activePeers()).toHaveLength(0);
    });

    it('records the fewest hops a peer has been heard at', async () => {
      const alice = await makeNode('alice', bus);
      await makeNode('bob', bus);
      const carol = await makeNode('carol', bus);
      bus.disconnect('alice', 'carol');

      await alice.service.sendText('via bob');
      expect(carol.service.activePeers()[0]!.minHopCount).toBe(1);

      // Alice walks into range. Carol now hears the same packet twice — once
      // relayed by Bob and once straight from Alice — and the direct copy is
      // a duplicate by packet id. It must still register that Alice is closer.
      bus.connect('alice', 'carol');
      await alice.service.sendText('direct now');
      expect(carol.service.activePeers()[0]!.minHopCount).toBe(0);
    });

    it('counts distinct messages, not rebroadcast copies', async () => {
      const alice = await makeNode('alice', bus);
      await makeNode('bob', bus);
      const carol = await makeNode('carol', bus);

      // All three in range, so Carol hears each of Alice's packets directly
      // and again via Bob's relay.
      await alice.service.sendText('one');
      await alice.service.sendText('two');

      const peer = carol.service
        .activePeers()
        .find(p => p.senderId === alice.identity.senderId)!;
      expect(peer.packetsHeard).toBe(2);
      expect(carol.received).toHaveLength(2);
    });
  });

  describe('counters', () => {
    it('tracks what was sent, received, relayed and dropped', async () => {
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);
      const carol = await makeNode('carol', bus);
      bus.disconnect('alice', 'carol');

      await alice.service.sendText('counted');

      expect(alice.service.stats.sent).toBe(1);
      expect(bob.service.stats.received).toBe(1);
      expect(bob.service.stats.relayed).toBe(1);
      expect(carol.service.stats.received).toBe(1);
    });
  });

  describe('reset', () => {
    it('clears peers and seen ids for panic wipe', async () => {
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);

      await alice.service.sendText('before the wipe');
      expect(bob.service.activePeers()).toHaveLength(1);

      bob.service.reset();

      expect(bob.service.activePeers()).toHaveLength(0);
      expect(bob.service.stats.received).toBe(0);
    });
  });

  describe('redundant paths', () => {
    it('survives one relay dropping out, without delivering twice', async () => {
      // Why a mesh is worth the complexity: two independent routes from Alice
      // to Carol. Either one alone is enough, and having both does not mean
      // Carol sees the message twice.
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);
      const dave = await makeNode('dave', bus);
      const carol = await makeNode('carol', bus);

      // Alice —— Bob —— Carol
      //   \—— Dave ——/
      bus.disconnect('alice', 'carol');
      bus.disconnect('bob', 'dave');

      await alice.service.sendText('two ways round');

      expect(bob.received).toHaveLength(1);
      expect(dave.received).toHaveLength(1);
      // Both relayed it, but Carol shows it once.
      expect(carol.received).toHaveLength(1);
      expect(carol.received[0]!.hopCount).toBe(1);
    });

    it('gets through when the only other relay is gone', async () => {
      const alice = await makeNode('alice', bus);
      const bob = await makeNode('bob', bus);
      const dave = await makeNode('dave', bus);
      const carol = await makeNode('carol', bus);
      bus.disconnect('alice', 'carol');
      bus.disconnect('bob', 'dave');

      // Bob's phone dies.
      await bob.service.stop();

      await alice.service.sendText('still arrives');

      expect(bob.received).toHaveLength(0);
      expect(carol.received).toHaveLength(1);
      expect(dave.received).toHaveLength(1);
    });
  });
});
