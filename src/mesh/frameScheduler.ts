/**
 * Deciding what goes on the air next.
 *
 * BLE advertising is not sending. A radio broadcasts **one** payload
 * continuously until told otherwise, so transmitting a six-frame packet means
 * rotating the advertised bytes through those six frames on a timer. And since
 * a receiver may be scanning in a different duty cycle, or briefly out of
 * range, or drowned out by a crowded 2.4GHz band, each frame has to go round
 * several times before the packet can be assumed delivered.
 *
 * There is no acknowledgement to work from — a broadcast mesh has no idea who
 * is listening — so redundancy through repetition is the only delivery
 * guarantee available.
 *
 * Two things this has to get right:
 *
 *   - **An SOS must not queue behind chat.** If someone is sending messages
 *     and then presses SOS, the SOS goes out next, not in fifteen seconds.
 *   - **Nothing may starve.** A steady stream of high-priority traffic must
 *     still leave lower-priority packets a turn, or a busy mesh silently drops
 *     everything ordinary.
 *
 * Pure logic, no radio, fully tested.
 */

export const PRIORITY = {
  /** SOS and danger reports — someone is in trouble now. */
  urgent: 2,
  /** Chat, "I'm safe". */
  normal: 1,
  /** Packets being relayed on behalf of others. */
  relay: 0,
} as const;

export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export interface EnqueueOptions {
  /**
   * How many times to broadcast the full frame sequence. More cycles means a
   * better chance of arriving and less airtime for everything else.
   */
  cycles?: number;
  priority?: Priority;
}

interface Job {
  frames: Uint8Array[];
  cursor: number;
  remainingCycles: number;
  priority: Priority;
  /** Insertion order, for FIFO within a priority band. */
  seq: number;
  /** Turns taken since this job last transmitted, for anti-starvation. */
  waited: number;
}

export interface SchedulerOptions {
  /** Default cycles per packet when the caller does not say. */
  defaultCycles?: number;
  /**
   * After this many consecutive turns lost to higher-priority traffic, a job
   * is promoted to the front regardless of priority. Without it, a burst of
   * urgent packets in a crowd would starve chat indefinitely.
   */
  starvationLimit?: number;
  /** Cap on queued jobs; the oldest low-priority job is dropped past this. */
  maxJobs?: number;
}

export class FrameScheduler {
  private readonly jobs: Job[] = [];
  private readonly defaultCycles: number;
  private readonly starvationLimit: number;
  private readonly maxJobs: number;
  private nextSeq = 0;

  constructor(options: SchedulerOptions = {}) {
    this.defaultCycles = options.defaultCycles ?? 3;
    this.starvationLimit = options.starvationLimit ?? 12;
    this.maxJobs = options.maxJobs ?? 32;
  }

  enqueue(frames: Uint8Array[], options: EnqueueOptions = {}): void {
    if (frames.length === 0) return;

    if (this.jobs.length >= this.maxJobs) {
      this.dropLowestPriorityJob();
    }

    this.jobs.push({
      frames,
      cursor: 0,
      remainingCycles: Math.max(1, options.cycles ?? this.defaultCycles),
      priority: options.priority ?? PRIORITY.normal,
      seq: this.nextSeq++,
      waited: 0,
    });
  }

  /**
   * The next frame to put on air, or null when there is nothing to send.
   *
   * Advances internal state, so calling it twice gives two different frames.
   */
  next(): Uint8Array | null {
    if (this.jobs.length === 0) return null;

    const chosen = this.pick();

    for (const job of this.jobs) {
      job.waited = job === chosen ? 0 : job.waited + 1;
    }

    const frame = chosen.frames[chosen.cursor]!;
    chosen.cursor += 1;

    if (chosen.cursor >= chosen.frames.length) {
      chosen.cursor = 0;
      chosen.remainingCycles -= 1;
      if (chosen.remainingCycles <= 0) {
        this.jobs.splice(this.jobs.indexOf(chosen), 1);
      }
    }

    return frame;
  }

  private pick(): Job {
    // Anything that has waited too long jumps the queue, whatever its
    // priority. This is what stops a stream of SOS traffic from silencing
    // every other message on a busy mesh.
    const starved = this.jobs
      .filter(job => job.waited >= this.starvationLimit)
      .sort((a, b) => a.seq - b.seq)[0];
    if (starved) return starved;

    return this.jobs.reduce((best, job) => {
      if (job.priority !== best.priority) {
        return job.priority > best.priority ? job : best;
      }
      return job.seq < best.seq ? job : best;
    });
  }

  private dropLowestPriorityJob(): void {
    const victim = this.jobs.reduce((worst, job) => {
      if (job.priority !== worst.priority) {
        return job.priority < worst.priority ? job : worst;
      }
      return job.seq < worst.seq ? job : worst;
    });
    this.jobs.splice(this.jobs.indexOf(victim), 1);
  }

  clear(): void {
    this.jobs.length = 0;
  }

  get pendingJobs(): number {
    return this.jobs.length;
  }

  get pendingFrames(): number {
    return this.jobs.reduce(
      (total, job) =>
        total + job.frames.length * job.remainingCycles - job.cursor,
      0,
    );
  }
}
