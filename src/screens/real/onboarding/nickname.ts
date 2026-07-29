/**
 * Suggested nicknames.
 *
 * CONTEXT.md's example is "Citizen-7X9". The point of offering a suggestion is
 * that the fastest path through this screen should also be the safest one —
 * someone in a hurry taps the suggestion and ends up anonymous, rather than
 * typing their real name because the field was empty and staring at them.
 */

const WORDS = [
  'Citizen',
  'Signal',
  'Beacon',
  'Relay',
  'Node',
  'Ember',
  'Sentinel',
  'Courier',
  'Lantern',
  'Anchor',
] as const;

/** No vowels, so the suffix cannot accidentally spell a word. */
const SUFFIX_CHARS = '0123456789BCDFGHJKLMNPQRSTVWXYZ';

export function suggestNickname(
  randomBytes: (length: number) => Uint8Array,
): string {
  const bytes = randomBytes(4);
  const word = WORDS[bytes[0]! % WORDS.length]!;
  let suffix = '';
  for (let i = 1; i < 4; i++) {
    suffix += SUFFIX_CHARS[bytes[i]! % SUFFIX_CHARS.length];
  }
  return `${word}-${suffix}`;
}

export const NICKNAME_MAX_LENGTH = 20;

export function isValidNickname(nickname: string): boolean {
  const trimmed = nickname.trim();
  return trimmed.length >= 2 && trimmed.length <= NICKNAME_MAX_LENGTH;
}
