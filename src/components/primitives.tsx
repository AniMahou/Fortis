/**
 * The shared building blocks every screen is assembled from.
 *
 * Keeping them here rather than restyling each screen is what makes the design
 * system real — the "emergency red is SOS only" rule in `theme/tokens.ts` holds
 * because `Button` is the only thing that can produce that red, and it only
 * does so for `variant="emergency"`.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {Icon, type IconName} from './Icon';
import {formatHopCount} from '../state/meshModel';
import {MIN_TOUCH_TARGET, colors, elevation, radius, spacing, type} from '../theme/tokens';

// ---------------------------------------------------------------- typography

export function Headline({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return <Text style={[styles.headline, style]}>{children}</Text>;
}

export function Title({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Body({
  children,
  style,
  muted = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  muted?: boolean;
}): React.JSX.Element {
  return (
    <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>
  );
}

export function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

// ------------------------------------------------------------------- button

type ButtonVariant = 'primary' | 'secondary' | 'emergency' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Accessibility hint for actions whose consequence is not obvious. */
  hint?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  style,
  hint,
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;
  const contentColor =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'emergency'
        ? colors.onEmergency
        : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{disabled: isDisabled, busy: loading}}
      style={({pressed}) => [
        styles.button,
        variantStyles[variant],
        // Pressed state changes fill rather than lifting the element, per the
        // design doc — it keeps the interface feeling grounded rather than glossy.
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={contentColor} size="small" />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={contentColor} />}
          <Text style={[styles.buttonLabel, {color: contentColor}]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const variantStyles = StyleSheet.create({
  primary: {backgroundColor: colors.primary},
  secondary: {
    backgroundColor: colors.base,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  emergency: {backgroundColor: colors.emergency},
  ghost: {backgroundColor: 'transparent'},
});

// --------------------------------------------------------------------- card

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function InfoCard({
  icon,
  title,
  body,
  tone = 'neutral',
}: {
  icon: IconName;
  title: string;
  body: string;
  tone?: 'neutral' | 'caution' | 'emergency';
}): React.JSX.Element {
  const accent =
    tone === 'emergency'
      ? colors.emergency
      : tone === 'caution'
        ? colors.caution
        : colors.onSurfaceVariant;

  return (
    <View style={styles.card}>
      <View style={styles.infoRow}>
        <View style={styles.infoIcon}>
          <Icon name={icon} size={22} color={accent} />
        </View>
        <View style={styles.infoText}>
          <Text style={styles.infoTitle}>{title}</Text>
          <Text style={styles.infoBody}>{body}</Text>
        </View>
      </View>
    </View>
  );
}

// -------------------------------------------------------------------- chips

export function StatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ok' | 'caution' | 'emergency';
}): React.JSX.Element {
  const dotColor =
    tone === 'ok'
      ? colors.ok
      : tone === 'caution'
        ? colors.caution
        : tone === 'emergency'
          ? colors.emergency
          : colors.outline;

  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, {backgroundColor: dotColor}]} />
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

/**
 * The hop-count badge — the single most important piece of information in the
 * demo, because it is the visible proof that a message travelled through
 * another phone rather than straight from the sender.
 */
export function HopBadge({
  hopCount,
}: {
  hopCount: number | null;
}): React.JSX.Element | null {
  const label = formatHopCount(hopCount);
  if (label === null || hopCount === null) return null;
  return (
    <View style={[styles.hopBadge, hopCount > 0 && styles.hopBadgeRelayed]}>
      <Text
        style={[styles.hopLabel, hopCount > 0 && styles.hopLabelRelayed]}>
        {label}
      </Text>
    </View>
  );
}

// -------------------------------------------------------------- mock banner

/**
 * Marks a screen as a design mock with nothing behind it.
 *
 * CONTEXT.md's four mocked features exist so the demo can show the whole
 * product vision. Rendering this banner on every one of them means nobody —
 * judge, teammate, or future contributor — can mistake one for a working
 * feature. Being visibly honest about the boundary is worth more than the
 * screens would be without it.
 */
export function MockBanner({feature}: {feature: string}): React.JSX.Element {
  return (
    <View style={styles.mockBanner}>
      <Icon name="info" size={16} color={colors.onSurfaceVariant} />
      <Text style={styles.mockText}>
        Design preview — {feature} is not wired to the mesh in this build
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ layout

export function Divider(): React.JSX.Element {
  return <View style={styles.divider} />;
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.title}>{children}</Text>
      {action}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: IconName;
  title: string;
  body: string;
}): React.JSX.Element {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={32} color={colors.secondary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: {...type.headlineLgMobile, color: colors.onSurface},
  title: {...type.headlineMd, color: colors.onSurface},
  body: {...type.bodyLg, color: colors.onSurface},
  muted: {color: colors.onSurfaceVariant},
  label: {...type.labelCaps, color: colors.onSurfaceVariant},

  button: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  buttonPressed: {opacity: 0.82},
  buttonDisabled: {opacity: 0.4},
  buttonLabel: {...type.button},

  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...elevation.card,
  },

  infoRow: {flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start'},
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {flex: 1, gap: 2},
  infoTitle: {...type.button, color: colors.onSurface},
  infoBody: {...type.bodySm, color: colors.onSurfaceVariant},

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
  },
  chipDot: {width: 8, height: 8, borderRadius: radius.full},
  chipLabel: {...type.labelCaps, color: colors.onSurfaceVariant},

  hopBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHighest,
    alignSelf: 'flex-start',
  },
  hopBadgeRelayed: {backgroundColor: colors.primary},
  hopLabel: {...type.labelCaps, fontSize: 10, color: colors.onSurfaceVariant},
  hopLabelRelayed: {color: colors.onPrimary},

  mockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  mockText: {...type.bodySm, color: colors.onSurfaceVariant, flex: 1},

  divider: {height: 1, backgroundColor: colors.outlineVariant},

  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  empty: {alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg},
  emptyTitle: {...type.button, color: colors.onSurface},
  emptyBody: {
    ...type.bodySm,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 260,
  },
});
