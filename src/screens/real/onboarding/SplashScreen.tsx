/**
 * Splash — a real initialisation step, not a timed delay.
 *
 * CONTEXT.md is specific about this: it must actually kick off key loading on
 * mount. So it opens the encrypted store, loads or creates the Ed25519
 * identity, and starts the mesh. The minimum display time exists only so the
 * wordmark does not flash past on a fast device.
 */

import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {AppStatusBar} from '../../../components/Screen';
import {Button} from '../../../components/primitives';
import {startServices} from '../../../app/services';
import {useIdentityStore} from '../../../state/identityStore';
import type {RootStackParamList} from '../../../navigation/types';
import {colors, spacing, type} from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

const MIN_DISPLAY_MS = 900;

export function SplashScreen({navigation}: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const startedAt = Date.now();
      try {
        await startServices();
        if (cancelled) return;

        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_DISPLAY_MS) {
          await new Promise<void>(resolve =>
            setTimeout(resolve, MIN_DISPLAY_MS - elapsed),
          );
        }
        if (cancelled) return;

        // Onboarding state is read after startup rather than before, because
        // a panic wipe resets it — a wiped device must land on Welcome, with
        // no trace that it was ever set up.
        const {onboardingComplete} = useIdentityStore.getState();
        navigation.replace(onboardingComplete ? 'Main' : 'Welcome');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigation, attempt]);

  return (
    <View style={styles.container}>
      <AppStatusBar />
      <View style={styles.center}>
        <Text style={styles.wordmark}>VOX</Text>
        <Text style={styles.tagline}>
          When the infrastructure fails,{'\n'}the people's voice never will
        </Text>
      </View>

      <View style={styles.footer}>
        {error === null ? (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.status}>Initialising mesh</Text>
          </>
        ) : (
          <>
            <Text style={styles.errorTitle}>Could not start</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => {
                setError(null);
                setAttempt(value => value + 1);
              }}
              style={styles.retry}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.base},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  wordmark: {
    ...type.headlineLg,
    fontSize: 56,
    lineHeight: 64,
    letterSpacing: 8,
    color: colors.primary,
  },
  tagline: {
    ...type.bodySm,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  status: {...type.labelCaps, color: colors.onSurfaceVariant},
  errorTitle: {...type.button, color: colors.onSurface},
  errorBody: {
    ...type.bodySm,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  retry: {marginTop: spacing.sm, alignSelf: 'stretch'},
});
