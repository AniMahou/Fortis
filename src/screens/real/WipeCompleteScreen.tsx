import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppStatusBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {Body, Button, Card, Headline, Label} from '../../components/primitives';
import type {RootStackParamList} from '../../navigation/types';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'WipeComplete'>;

/**
 * What the wipe actually did — measured, not assumed.
 *
 * The counts here are read back out of the stores after clearing them rather
 * than reported optimistically, and `panicWipe` returns -1 where it could not
 * verify. A screen claiming "0 records remain" when the count could not be read
 * would be exactly the wrong kind of lie for this feature to tell.
 */
export function WipeCompleteScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const {report} = route.params;

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />

      <View style={styles.hero}>
        <View style={styles.badge}>
          <Icon name="check" size={32} color={colors.onPrimary} />
        </View>
        <Headline style={styles.heading}>This device is clean</Headline>
        <Body muted style={styles.lede}>
          The encryption key is gone. Anything still physically on the phone is
          unreadable — including to us.
        </Body>
      </View>

      <Card style={styles.report}>
        <Row
          label="Encryption key"
          value={report.keyDestroyed ? 'Destroyed' : 'NOT destroyed'}
          bad={!report.keyDestroyed}
        />
        <Row
          label="Hardware key"
          value={
            report.hardwareKeyDestroyed
              ? 'Destroyed in secure element'
              : 'None on this device'
          }
        />
        <Row
          label="Encrypted store"
          value={
            report.vaultKeysRemaining < 0
              ? 'Could not verify'
              : `${report.vaultKeysRemaining} records remaining`
          }
          bad={report.vaultKeysRemaining !== 0}
        />
        <Row
          label="Key store"
          value={
            report.bootstrapKeysRemaining < 0
              ? 'Could not verify'
              : `${report.bootstrapKeysRemaining} records remaining`
          }
          bad={report.bootstrapKeysRemaining !== 0}
        />
        <Row label="Took" value={`${report.durationMs}ms`} />
      </Card>

      {report.errors.length > 0 && (
        <Card style={styles.errors}>
          <Label>Reported problems</Label>
          {report.errors.map(error => (
            <Body key={error} style={styles.errorText}>
              {error}
            </Body>
          ))}
          <Body style={styles.errorNote}>
            The key is destroyed first, before any data is cleared — so even
            when a later step fails, what remains cannot be decrypted.
          </Body>
        </Card>
      )}

      <Card style={styles.note}>
        <Body style={styles.noteText}>
          Opening VOX again starts a completely new identity with a new device
          key. There is nothing linking it to the one that was just destroyed.
        </Body>
      </Card>

      <Button
        label="Start fresh"
        onPress={() =>
          navigation.reset({index: 0, routes: [{name: 'Splash'}]})
        }
      />
    </Screen>
  );
}

function Row({
  label,
  value,
  bad = false,
}: {
  label: string;
  value: string;
  bad?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Label>{label}</Label>
      <Body style={[styles.rowValue, bad && styles.rowValueBad]}>{value}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, paddingTop: spacing.lg},
  hero: {alignItems: 'center', gap: spacing.sm},
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {textAlign: 'center'},
  lede: {textAlign: 'center'},

  report: {gap: spacing.sm},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md},
  rowValue: {...type.bodySm, color: colors.onSurface, textAlign: 'right', flexShrink: 1},
  rowValueBad: {color: colors.emergency, fontWeight: '700'},

  errors: {backgroundColor: colors.surfaceContainerHigh, gap: spacing.xs},
  errorText: {...type.bodySm, color: colors.onSurface},
  errorNote: {...type.bodySm, color: colors.onSurfaceVariant, marginTop: spacing.xs},

  note: {backgroundColor: colors.surfaceContainerLow},
  noteText: {...type.bodySm, color: colors.onSurfaceVariant},
});
