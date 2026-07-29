/**
 * Screen chrome — the safe-area wrapper, the header, and the back bar.
 */

import React from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Icon} from './Icon';
import {StatusChip} from './primitives';
import {MIN_TOUCH_TARGET, colors, radius, spacing, type} from '../theme/tokens';

export function Screen({
  children,
  scroll = true,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const padding = {paddingTop: insets.top, paddingBottom: insets.bottom};

  if (!scroll) {
    return (
      <View style={[styles.screen, padding, style]}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, padding, style]}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * The app header.
 *
 * The device count is a real count of mesh peers heard from recently — see
 * `meshService.activePeers`. CONTEXT.md is explicit that the mockup's
 * "47 DEVICES" is a placeholder and not a target, so when two phones are in
 * range this says 2, and when none are it says so plainly.
 */
export function AppHeader({
  peerCount,
  onLongPressLogo,
}: {
  peerCount: number;
  onLongPressLogo?: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.header}>
      <Pressable
        onLongPress={onLongPressLogo}
        delayLongPress={600}
        accessibilityRole="header"
        accessibilityHint={
          onLongPressLogo ? 'Long press for mesh diagnostics' : undefined
        }>
        <Text style={styles.wordmark}>VOX</Text>
      </Pressable>
      <StatusChip
        label={peerCount === 0 ? 'No peers' : `${peerCount} nearby`}
        tone={peerCount > 0 ? 'ok' : 'neutral'}
      />
    </View>
  );
}

export function BackBar({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: () => void;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.backBar}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          style={styles.backButton}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
      ) : (
        <View style={styles.backButton} />
      )}
      <Text style={styles.backTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.backAction}>{action}</View>
    </View>
  );
}

export function AppStatusBar(): React.JSX.Element {
  return <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  content: {
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  wordmark: {
    ...type.headlineMd,
    letterSpacing: 2,
    color: colors.primary,
  },

  backBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    width: MIN_TOUCH_TARGET - 8,
    height: MIN_TOUCH_TARGET - 8,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTitle: {...type.headlineMd, color: colors.onSurface, flex: 1},
  backAction: {minWidth: MIN_TOUCH_TARGET - 8, alignItems: 'flex-end'},
});
