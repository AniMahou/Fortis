import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useState} from 'react';
import {Alert, Pressable, StyleSheet, TextInput, View} from 'react-native';
import {AppStatusBar, BackBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {
  Body,
  Button,
  Card,
  Headline,
  Label,
} from '../../components/primitives';
import {sendDangerReport} from '../../app/services';
import {DANGER_KINDS, MAX_NOTE_BYTES, type DangerKind} from '../../mesh/payloads';
import type {RootStackParamList} from '../../navigation/types';
import {DANGER_LABELS} from './SafetyMapScreen';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportDanger'>;

/**
 * Reporting a hazard.
 *
 * Kept to two taps and an optional note. Someone doing this is very likely
 * standing near the thing they are reporting — a long form would mean either a
 * bad report or no report.
 */
export function ReportDangerScreen({navigation}: Props): React.JSX.Element {
  const [kind, setKind] = useState<DangerKind | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const onSend = async () => {
    if (!kind) return;
    setSending(true);
    try {
      const position = await sendDangerReport(kind, note.trim() || undefined);
      navigation.goBack();
      Alert.alert(
        'Hazard broadcast',
        `${DANGER_LABELS[kind]} reported at your position (±${Math.round(
          position.accuracy,
        )}m). Nearby phones will pass it on.`,
      );
    } catch (err) {
      Alert.alert(
        'Could not send the report',
        err instanceof Error
          ? `${err.message}\n\nA hazard report needs a position, so Location must be on.`
          : 'Something went wrong.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <BackBar title="" onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <Headline>What is happening?</Headline>
        <Body muted>
          Your current position is attached automatically and broadcast to every
          phone in range.
        </Body>
      </View>

      <View style={styles.grid}>
        {DANGER_KINDS.map(option => (
          <Pressable
            key={option}
            onPress={() => setKind(option)}
            accessibilityRole="radio"
            accessibilityState={{selected: kind === option}}
            accessibilityLabel={DANGER_LABELS[option]}
            style={[styles.option, kind === option && styles.optionSelected]}>
            <Icon
              name="warning"
              size={20}
              color={kind === option ? colors.onEmergency : colors.onSurface}
            />
            <Body
              style={[
                styles.optionLabel,
                kind === option && styles.optionLabelSelected,
              ]}>
              {DANGER_LABELS[option]}
            </Body>
          </Pressable>
        ))}
      </View>

      <View style={styles.field}>
        <Label>Note (optional)</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. junction blocked, head north"
          placeholderTextColor={colors.secondary}
          style={styles.input}
          maxLength={MAX_NOTE_BYTES}
          multiline
          accessibilityLabel="Optional note"
        />
        <Label>
          A note makes the packet longer and slower to send over Bluetooth.
        </Label>
      </View>

      <Card style={styles.warning}>
        <Body style={styles.warningText}>
          This broadcasts your location to everyone nearby, including anyone
          running VOX with bad intent. Report the hazard, not yourself — move
          away from the spot first if you can.
        </Body>
      </Card>

      <Button
        label="Broadcast hazard"
        variant="emergency"
        onPress={onSend}
        disabled={!kind}
        loading={sending}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  hero: {gap: spacing.sm},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  option: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.base,
  },
  optionSelected: {
    backgroundColor: colors.emergency,
    borderColor: colors.emergency,
  },
  optionLabel: {...type.bodySm, flexShrink: 1},
  optionLabelSelected: {color: colors.onEmergency},

  field: {gap: spacing.xs + 2},
  input: {
    ...type.bodyLg,
    color: colors.onSurface,
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: radius.md,
    backgroundColor: colors.base,
    padding: spacing.md,
    textAlignVertical: 'top',
  },

  warning: {backgroundColor: colors.surfaceContainerHigh},
  warningText: {...type.bodySm, color: colors.onSurface},
});
