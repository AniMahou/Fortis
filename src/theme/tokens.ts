/**
 * Design tokens, carried over from the Stitch export
 * (docs/design/DESIGN_TOKENS.md).
 *
 * The palette is monochrome with exactly one accent, and the rule that goes
 * with it is not decorative: **`emergency` is reserved for SOS and safety
 * actions only.** Its entire value is that it means one thing. The moment a
 * red is used for a delete button or a validation error, a user scanning the
 * screen under stress can no longer trust that red means danger.
 *
 * The restraint elsewhere is deliberate too — this is a UI meant to stay
 * legible in bad light, at arm's length, by someone who is frightened.
 */

import {Platform, type TextStyle} from 'react-native';

export const colors = {
  /** Core branding, primary actions, headings. */
  primary: '#1A1A1A',
  onPrimary: '#FFFFFF',

  /** Borders, disabled states, de-emphasised metadata. */
  secondary: '#B0B0B0',

  /**
   * SOS and safety only. Never for delete, never for validation errors,
   * never for emphasis.
   */
  emergency: '#C8102E',
  onEmergency: '#FFFFFF',

  base: '#FFFFFF',
  surface: '#F9F9F9',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F3F3F4',
  surfaceContainer: '#EEEEEE',
  surfaceContainerHigh: '#E8E8E8',
  surfaceContainerHighest: '#E2E2E2',

  onSurface: '#1A1C1C',
  onSurfaceVariant: '#444748',

  outline: '#747878',
  outlineVariant: '#C4C7C7',

  /** Non-emergency status. Green for "connected", amber for "degraded". */
  ok: '#2E7D32',
  caution: '#B26A00',
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

/** 4px baseline. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 32,
  xl: 48,
  /** Screen side margins on mobile. */
  margin: 16,
} as const;

/**
 * Inter is what the design specifies. It is not bundled here — see
 * `assets/fonts/README.md` for the one-command upgrade. Until then this falls
 * back to the platform UI font, which on Android is Roboto: another neutral
 * grotesque at a very similar optical size, so the type scale below still
 * reads as intended.
 */
export const fontFamily = Platform.select({
  android: 'sans-serif',
  default: 'System',
});

const fontFamilyMedium = Platform.select({
  android: 'sans-serif-medium',
  default: 'System',
});

export const type = {
  headlineLg: {
    fontFamily,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.64,
  },
  headlineLgMobile: {
    fontFamily,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.24,
  },
  headlineMd: {
    fontFamily: fontFamilyMedium,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
  },
  bodyLg: {
    fontFamily,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  bodySm: {
    fontFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  labelCaps: {
    fontFamily: fontFamilyMedium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: fontFamilyMedium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
} satisfies Record<string, TextStyle>;

/**
 * Depth via low-contrast outlines rather than heavy shadows, per the design
 * doc — it keeps the interface flat and legible instead of glossy.
 */
export const elevation = {
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  modal: {
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 15,
    shadowOffset: {width: 0, height: 10},
    elevation: 8,
  },
} as const;

/**
 * Minimum touch target. Android's guideline is 48dp, and this app is used
 * one-handed, in a hurry, possibly while moving — undersized targets are a
 * usability failure here in a way they are not in a settings screen.
 */
export const MIN_TOUCH_TARGET = 48;
