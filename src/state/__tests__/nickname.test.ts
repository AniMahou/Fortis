import nacl from 'tweetnacl';
import {
  NICKNAME_MAX_LENGTH,
  isValidNickname,
  suggestNickname,
} from '../../screens/real/onboarding/nickname';

describe('suggestNickname', () => {
  it('produces a Word-XXX handle', () => {
    expect(suggestNickname(nacl.randomBytes)).toMatch(
      /^[A-Z][a-z]+-[0-9BCDFGHJKLMNPQRSTVWXYZ]{3}$/,
    );
  });

  it('always fits the nickname limit', () => {
    for (let i = 0; i < 200; i++) {
      expect(suggestNickname(nacl.randomBytes).length).toBeLessThanOrEqual(
        NICKNAME_MAX_LENGTH,
      );
    }
  });

  it('is always accepted by the validator', () => {
    // The fastest path through the screen must also be a valid one — a
    // suggestion the Continue button rejects would be a bad joke.
    for (let i = 0; i < 200; i++) {
      expect(isValidNickname(suggestNickname(nacl.randomBytes))).toBe(true);
    }
  });

  it('varies', () => {
    const seen = new Set(
      Array.from({length: 100}, () => suggestNickname(nacl.randomBytes)),
    );
    // 10 words x 31^3 suffixes; 100 draws colliding into fewer than 50 distinct
    // values would mean the generator is not using its randomness.
    expect(seen.size).toBeGreaterThan(50);
  });

  it('uses no vowels in the suffix', () => {
    // So a random suffix cannot spell something unfortunate that the user then
    // carries as their visible handle in a crowd.
    for (let i = 0; i < 200; i++) {
      const suffix = suggestNickname(nacl.randomBytes).split('-')[1]!;
      expect(suffix).not.toMatch(/[AEIOU]/);
    }
  });

  it('is deterministic for given bytes', () => {
    const fixed = () => new Uint8Array([3, 7, 11, 19]);
    expect(suggestNickname(fixed)).toBe(suggestNickname(fixed));
  });
});

describe('isValidNickname', () => {
  it.each(['ab', 'Citizen-7X9', 'রফিক', 'a'.repeat(NICKNAME_MAX_LENGTH)])(
    'accepts %s',
    nickname => {
      expect(isValidNickname(nickname)).toBe(true);
    },
  );

  it.each([
    ['empty', ''],
    ['one character', 'a'],
    ['whitespace only', '   '],
    ['too long', 'a'.repeat(NICKNAME_MAX_LENGTH + 1)],
  ])('rejects %s', (_label, nickname) => {
    expect(isValidNickname(nickname)).toBe(false);
  });

  it('ignores surrounding whitespace when measuring', () => {
    expect(isValidNickname('  ab  ')).toBe(true);
  });
});
