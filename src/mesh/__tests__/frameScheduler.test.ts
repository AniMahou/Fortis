import {FrameScheduler, PRIORITY} from '../frameScheduler';

/** Frames tagged by a single identifying byte, so output is easy to read. */
const framesFor = (tag: number, count: number) =>
  Array.from({length: count}, (_, i) => new Uint8Array([tag, i]));

const drain = (scheduler: FrameScheduler, turns: number) => {
  const out: string[] = [];
  for (let i = 0; i < turns; i++) {
    const frame = scheduler.next();
    if (frame === null) break;
    out.push(`${frame[0]}:${frame[1]}`);
  }
  return out;
};

describe('FrameScheduler', () => {
  it('returns null when there is nothing to send', () => {
    expect(new FrameScheduler().next()).toBeNull();
  });

  it('cycles through a packet frames in order', () => {
    const scheduler = new FrameScheduler();
    scheduler.enqueue(framesFor(1, 3), {cycles: 1});

    expect(drain(scheduler, 10)).toEqual(['1:0', '1:1', '1:2']);
  });

  it('repeats the sequence, since a broadcast mesh has no acknowledgements', () => {
    // Repetition is the only delivery guarantee available: nobody
    // acknowledges a BLE advertisement, so a receiver that was scanning
    // elsewhere on the first pass gets another chance.
    const scheduler = new FrameScheduler();
    scheduler.enqueue(framesFor(1, 2), {cycles: 3});

    expect(drain(scheduler, 10)).toEqual([
      '1:0', '1:1',
      '1:0', '1:1',
      '1:0', '1:1',
    ]);
  });

  it('drops a job once its cycles are spent', () => {
    const scheduler = new FrameScheduler();
    scheduler.enqueue(framesFor(1, 2), {cycles: 1});

    drain(scheduler, 2);

    expect(scheduler.pendingJobs).toBe(0);
    expect(scheduler.next()).toBeNull();
  });

  it('ignores an empty frame list', () => {
    const scheduler = new FrameScheduler();
    scheduler.enqueue([], {cycles: 3});
    expect(scheduler.pendingJobs).toBe(0);
  });

  describe('priority', () => {
    it('puts an SOS ahead of chat already queued', () => {
      // Someone typing messages then pressing SOS must not wait fifteen
      // seconds for the chat backlog to clear.
      const scheduler = new FrameScheduler();
      scheduler.enqueue(framesFor(1, 4), {
        cycles: 3,
        priority: PRIORITY.normal,
      });
      scheduler.enqueue(framesFor(9, 2), {
        cycles: 1,
        priority: PRIORITY.urgent,
      });

      const first = drain(scheduler, 2);
      expect(first).toEqual(['9:0', '9:1']);
    });

    it('sends relayed traffic only when nothing of ours is waiting', () => {
      const scheduler = new FrameScheduler();
      scheduler.enqueue(framesFor(7, 2), {cycles: 1, priority: PRIORITY.relay});
      scheduler.enqueue(framesFor(1, 2), {
        cycles: 1,
        priority: PRIORITY.normal,
      });

      expect(drain(scheduler, 4)).toEqual(['1:0', '1:1', '7:0', '7:1']);
    });

    it('is FIFO within a priority band', () => {
      const scheduler = new FrameScheduler();
      scheduler.enqueue(framesFor(1, 1), {cycles: 1});
      scheduler.enqueue(framesFor(2, 1), {cycles: 1});
      scheduler.enqueue(framesFor(3, 1), {cycles: 1});

      expect(drain(scheduler, 3)).toEqual(['1:0', '2:0', '3:0']);
    });
  });

  describe('starvation', () => {
    it('eventually sends a low-priority packet under constant urgent traffic', () => {
      // In a crowd, urgent packets can arrive faster than they drain. Without
      // this, ordinary messages would never go out at all — the mesh would
      // look like it was working while quietly dropping everything normal.
      const scheduler = new FrameScheduler({starvationLimit: 5});
      scheduler.enqueue(framesFor(1, 2), {
        cycles: 10,
        priority: PRIORITY.normal,
      });

      const sent: string[] = [];
      for (let turn = 0; turn < 30; turn++) {
        // A fresh urgent packet every turn.
        scheduler.enqueue(framesFor(9, 1), {
          cycles: 1,
          priority: PRIORITY.urgent,
        });
        const frame = scheduler.next();
        if (frame) sent.push(`${frame[0]}:${frame[1]}`);
      }

      expect(sent.some(entry => entry.startsWith('1:'))).toBe(true);
    });

    it('still prefers urgent traffic in the ordinary case', () => {
      const scheduler = new FrameScheduler({starvationLimit: 100});
      scheduler.enqueue(framesFor(1, 2), {cycles: 5});
      scheduler.enqueue(framesFor(9, 2), {cycles: 5, priority: PRIORITY.urgent});

      expect(drain(scheduler, 4)).toEqual(['9:0', '9:1', '9:0', '9:1']);
    });
  });

  describe('bounded queue', () => {
    it('drops the least important queued job rather than growing forever', () => {
      const scheduler = new FrameScheduler({maxJobs: 3});
      scheduler.enqueue(framesFor(1, 1), {priority: PRIORITY.relay});
      scheduler.enqueue(framesFor(2, 1), {priority: PRIORITY.normal});
      scheduler.enqueue(framesFor(3, 1), {priority: PRIORITY.urgent});

      scheduler.enqueue(framesFor(4, 1), {priority: PRIORITY.urgent});

      expect(scheduler.pendingJobs).toBe(3);
      const sent = drain(scheduler, 20);
      // The relayed job was sacrificed; ours survived.
      expect(sent.some(entry => entry.startsWith('1:'))).toBe(false);
      expect(sent.some(entry => entry.startsWith('3:'))).toBe(true);
      expect(sent.some(entry => entry.startsWith('4:'))).toBe(true);
    });
  });

  it('drops everything on clear, for panic wipe', () => {
    const scheduler = new FrameScheduler();
    scheduler.enqueue(framesFor(1, 4), {cycles: 5});

    scheduler.clear();

    expect(scheduler.pendingJobs).toBe(0);
    expect(scheduler.next()).toBeNull();
  });

  it('reports how much is still queued', () => {
    const scheduler = new FrameScheduler();
    scheduler.enqueue(framesFor(1, 3), {cycles: 2});
    expect(scheduler.pendingFrames).toBe(6);

    scheduler.next();
    expect(scheduler.pendingFrames).toBe(5);
  });
});
