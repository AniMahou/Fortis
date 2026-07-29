import {
  PIN_LENGTH,
  hashPin,
  isValidPin,
  makeSalt,
  verifyPin,
} from '../pin';

// Low iteration count so the suite stays fast. The production default is
// 20,000; what is under test is the logic, not the work factor.
const ITERATIONS = 50;

describe('isValidPin', () => {
  it.each(['0000', '1234', '9999'])('accepts %s', pin => {
    expect(isValidPin(pin)).toBe(true);
  });

  it.each([
    ['too short', '123'],
    ['too long', '12345'],
    ['letters', '12a4'],
    ['empty', ''],
    ['spaces', '12 4'],
    ['unicode digits', '١٢٣٤'],
  ])('rejects %s', (_label, pin) => {
    expect(isValidPin(pin)).toBe(false);
  });

  it('matches the declared length', () => {
    expect('1234'.length).toBe(PIN_LENGTH);
  });
});

describe('hashPin', () => {
  it('is deterministic for the same pin and salt', () => {
    const salt = makeSalt();
    expect(hashPin('1234', salt, ITERATIONS)).toBe(
      hashPin('1234', salt, ITERATIONS),
    );
  });

  it('differs for a different pin', () => {
    const salt = makeSalt();
    expect(hashPin('1234', salt, ITERATIONS)).not.toBe(
      hashPin('1235', salt, ITERATIONS),
    );
  });

  it('differs for the same pin under a different salt', () => {
    // Why the salt exists: without it, two devices with the same PIN would
    // store identical hashes, and one cracked hash would crack every device.
    expect(hashPin('1234', makeSalt(), ITERATIONS)).not.toBe(
      hashPin('1234', makeSalt(), ITERATIONS),
    );
  });

  it('never contains the pin', () => {
    expect(hashPin('1234', makeSalt(), ITERATIONS)).not.toContain('1234');
  });
});

describe('makeSalt', () => {
  it('is different every time', () => {
    const salts = new Set(Array.from({length: 100}, () => makeSalt()));
    expect(salts.size).toBe(100);
  });
});

describe('verifyPin', () => {
  it('accepts the correct pin', () => {
    const salt = makeSalt();
    const hash = hashPin('4821', salt, ITERATIONS);
    expect(verifyPin('4821', salt, hash, ITERATIONS)).toBe(true);
  });

  it('rejects the wrong pin', () => {
    const salt = makeSalt();
    const hash = hashPin('4821', salt, ITERATIONS);
    expect(verifyPin('4822', salt, hash, ITERATIONS)).toBe(false);
  });

  it('rejects a malformed pin without hashing it', () => {
    const salt = makeSalt();
    const hash = hashPin('4821', salt, ITERATIONS);
    expect(verifyPin('48', salt, hash, ITERATIONS)).toBe(false);
    expect(verifyPin('abcd', salt, hash, ITERATIONS)).toBe(false);
  });

  it('rejects when the stored hash is the wrong shape', () => {
    expect(verifyPin('1234', makeSalt(), 'garbage', ITERATIONS)).toBe(false);
  });

  it('rejects the right pin against the wrong salt', () => {
    const hash = hashPin('4821', makeSalt(), ITERATIONS);
    expect(verifyPin('4821', makeSalt(), hash, ITERATIONS)).toBe(false);
  });

  it('rejects when the iteration count does not match', () => {
    const salt = makeSalt();
    const hash = hashPin('4821', salt, ITERATIONS);
    expect(verifyPin('4821', salt, hash, ITERATIONS + 1)).toBe(false);
  });
});

describe('what this does not protect against', () => {
  it('is brute-forceable by design — there are only 10,000 pins', () => {
    // Stated as an executable fact rather than only a comment. A 4-digit PIN
    // is a screen lock, not encryption. What actually protects the data is the
    // 256-bit master key in storage/masterKey.ts, which panic wipe destroys.
    const salt = makeSalt();
    const hash = hashPin('7391', salt, ITERATIONS);

    let found: string | null = null;
    for (let candidate = 0; candidate < 10_000; candidate++) {
      const guess = String(candidate).padStart(4, '0');
      if (verifyPin(guess, salt, hash, ITERATIONS)) {
        found = guess;
        break;
      }
    }

    expect(found).toBe('7391');
  });
});
