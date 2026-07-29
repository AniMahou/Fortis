import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {AppStatusBar, BackBar, Screen} from '../../../components/Screen';
import {Body, Button, Card, Headline} from '../../../components/primitives';
import {Icon} from '../../../components/Icon';
import {getServices} from '../../../app/services';
import {useIdentityStore} from '../../../state/identityStore';
import {PIN_LENGTH} from '../../../state/pin';
import type {RootStackParamList} from '../../../navigation/types';
import {
  MIN_TOUCH_TARGET,
  colors,
  radius,
  spacing,
  type,
} from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'SetPin'>;

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '<'];

export function SetPinScreen({navigation}: Props): React.JSX.Element {
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setStorePin = useIdentityStore(state => state.setPin);

  const stage = confirmation === null ? 'enter' : 'confirm';

  const press = (key: string) => {
    setError(null);
    if (key === '<') {
      setPin(current => current.slice(0, -1));
      return;
    }
    if (key === '' || pin.length >= PIN_LENGTH) return;

    const next = pin + key;
    setPin(next);
    if (next.length < PIN_LENGTH) return;

    if (stage === 'enter') {
      setConfirmation(next);
      setPin('');
      return;
    }
    if (next !== confirmation) {
      // Start over from the first entry rather than just the confirmation —
      // if they mistyped the first one, re-confirming a wrong PIN is worse.
      setError('Those did not match. Start again.');
      setConfirmation(null);
      setPin('');
      return;
    }

    const vault = getServices()?.storage.vault;
    if (vault) setStorePin(vault, next);
    navigation.navigate('Permissions');
  };

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <AppStatusBar />
      <BackBar title="" onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <View style={styles.lockBadge}>
          <Icon name="lock" size={22} color={colors.primary} />
        </View>
        <Headline>
          {stage === 'enter' ? 'Set a PIN' : 'Enter it again'}
        </Headline>
        <Body muted style={styles.lede}>
          Optional. It stops someone who picks up your unlocked phone from
          opening VOX.
        </Body>
      </View>

      <View style={styles.dots}>
        {Array.from({length: PIN_LENGTH}, (_, index) => (
          <View
            key={index}
            style={[styles.dot, index < pin.length && styles.dotFilled]}
          />
        ))}
      </View>

      <Text style={[styles.error, !error && styles.errorHidden]}>
        {error ?? ' '}
      </Text>

      <View style={styles.keypad}>
        {KEYS.map((key, index) => (
          <Pressable
            key={index}
            onPress={() => press(key)}
            disabled={key === ''}
            accessibilityRole="button"
            accessibilityLabel={key === '<' ? 'Delete' : key}
            style={({pressed}) => [
              styles.key,
              key === '' && styles.keyBlank,
              pressed && key !== '' && styles.keyPressed,
            ]}>
            {key === '<' ? (
              <Icon name="arrow-left" size={22} color={colors.onSurface} />
            ) : (
              <Text style={styles.keyLabel}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>

      {/*
        Stated plainly rather than implied by a padlock. A 4-digit PIN has
        10,000 possible values — it is a screen lock, not encryption, and the
        person deciding whether to carry this phone deserves to know which.
      */}
      <Card style={styles.note}>
        <Body style={styles.noteText}>
          A 4-digit PIN can be guessed by anyone with time and the phone in
          hand. What actually protects your messages is the encryption key on
          this device, which panic wipe destroys.
        </Body>
      </Card>

      <Button
        label="Skip for now"
        variant="ghost"
        onPress={() => navigation.navigate('Permissions')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {flex: 1, gap: spacing.sm},
  hero: {alignItems: 'center', gap: spacing.sm},
  lockBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lede: {textAlign: 'center', maxWidth: 300},

  dots: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.secondary,
  },
  dotFilled: {backgroundColor: colors.primary, borderColor: colors.primary},

  error: {
    ...type.bodySm,
    color: colors.emergency,
    textAlign: 'center',
    minHeight: 20,
  },
  errorHidden: {opacity: 0},

  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  key: {
    width: '30%',
    height: MIN_TOUCH_TARGET + 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBlank: {backgroundColor: 'transparent'},
  keyPressed: {backgroundColor: colors.surfaceContainerHighest},
  keyLabel: {...type.headlineMd, fontSize: 22, color: colors.onSurface},

  note: {backgroundColor: colors.surfaceContainerLow, marginTop: spacing.sm},
  noteText: {...type.bodySm, color: colors.onSurfaceVariant},
});
