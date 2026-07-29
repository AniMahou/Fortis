import type {KeyValueBackend} from './types';

/**
 * An in-memory KeyValueBackend.
 *
 * Used by the test suite, and by the `loopback` transport so the whole app can
 * be driven on a simulator with no MMKV native module present.
 */
export class MemoryBackend implements KeyValueBackend {
  private readonly map = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        this.map.set(key, value);
      }
    }
  }

  getString(key: string): string | undefined {
    return this.map.get(key);
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  getAllKeys(): string[] {
    return [...this.map.keys()];
  }

  clearAll(): void {
    this.map.clear();
  }

  /** Test helper: assert on what physically remains after a wipe. */
  get size(): number {
    return this.map.size;
  }
}
