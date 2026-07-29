/**
 * The SOS trigger.
 *
 * Hold to send, not tap. The Stitch design uses a 2-second hold and it is the
 * right call: this broadcasts your location to every stranger in range, and it
 * lives on the main screen of an app used one-handed while moving. An
 * accidental tap would be both a false alarm on other people's phones and an
 * unintended disclosure of where you are.
 *
 * The progress ring exists so the hold does not feel like the button is
 * broken — without visible feedback, people let go at around 800ms.
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import {Icon} from './Icon';
import {colors, radius, spacing, type} from '../theme/tokens';

export const SOS_HOLD_MS = 2000;

interface SosButtonProps {
  onTrigger: () => void;
  disabled?: boolean;
  sending?: boolean;
}

export function SosButton({
  onTrigger,
  disabled = false,
  sending = false,
}: SosButtonProps): React.JSX.Element {
  const [holding, setHolding] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => cancel, [cancel]);

  const start = () => {
    if (disabled || sending) return;
    setHolding(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: SOS_HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      progress.setValue(0);
      // Haptic confirmation matters here: the phone may well be in a pocket or
      // held out of sight by the time this completes.
      Vibration.vibrate([0, 80, 60, 80, 60, 300]);
      onTrigger();
    }, SOS_HOLD_MS);
  };

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled || sending}
      accessibilityRole="button"
      accessibilityLabel="Send SOS"
      accessibilityHint="Hold for two seconds to broadcast your location to every phone in range"
      accessibilityState={{disabled: disabled || sending, busy: sending}}
      style={({pressed}) => [
        styles.button,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Animated.View style={[styles.progress, {width}]} />
      <View style={styles.contentRow}>
        <Icon name="sos" size={30} color={colors.onEmergency} />
        <View>
          <Text style={styles.label}>
            {sending
              ? 'BROADCASTING'
              : holding
                ? 'KEEP HOLDING'
                : 'HOLD TO SEND SOS'}
          </Text>
          <Text style={styles.sublabel}>
            {sending
              ? 'Attaching your position'
              : 'Broadcasts your location to everyone nearby'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 88,
    borderRadius: radius.lg,
    backgroundColor: colors.emergency,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pressed: {opacity: 0.94},
  disabled: {opacity: 0.5},
  progress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  label: {
    ...type.headlineMd,
    color: colors.onEmergency,
    letterSpacing: 0.5,
  },
  sublabel: {
    ...type.bodySm,
    color: colors.onEmergency,
    opacity: 0.85,
    marginTop: 2,
  },
});
