/**
 * Misinformation reporting — **mocked**.
 *
 * Deliberately the most cautious of the four mocked screens. A tool that lets
 * anyone flag a message as false, on a network with no identities and no
 * moderators, is a tool for suppressing inconvenient reports — which during
 * the 2024 shutdown is exactly what the people spreading rumours would have
 * wanted. Shipping this half-built would be worse than not shipping it.
 *
 * The screen says that out loud, because it is a better answer to "why isn't
 * this done?" than an apology.
 */

import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import {AppStatusBar, BackBar, Screen} from '../../components/Screen';
import {
  Body,
  Button,
  Card,
  Headline,
  MockBanner,
} from '../../components/primitives';
import type {RootStackParamList} from '../../navigation/types';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Misinformation'>;

const REASONS = [
  'Claims something that did not happen',
  'Wrong or misleading location',
  'Impersonating a medical or legal volunteer',
  'Deliberately spreading panic',
] as const;

export function MisinformationScreen({navigation}: Props): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <BackBar title="" onBack={() => navigation.goBack()} />

      <Headline>Report misinformation</Headline>
      <MockBanner feature="misinformation reporting" />

      <View style={styles.list}>
        {REASONS.map(reason => (
          <Pressable
            key={reason}
            onPress={() => setSelected(reason)}
            accessibilityRole="radio"
            accessibilityState={{selected: selected === reason}}
            style={[
              styles.reason,
              selected === reason && styles.reasonSelected,
            ]}>
            <View
              style={[
                styles.radio,
                selected === reason && styles.radioSelected,
              ]}
            />
            <Body style={styles.reasonText}>{reason}</Body>
          </Pressable>
        ))}
      </View>

      <Card style={styles.why}>
        <Body style={styles.whyTitle}>Why this is not wired up</Body>
        <Body style={styles.whyText}>
          On a network with no identities and no moderators, a report button is
          also a suppression button. Anyone can flag anything, and the loudest
          coordinated group wins.
        </Body>
        <Body style={styles.whyText}>
          During the 2024 shutdown, the people with the most reason to suppress
          a report were the ones spreading the rumours. A flag that quietly
          hides a true warning about a crackdown would cost more than the
          rumours it caught.
        </Body>
        <Body style={styles.whyText}>
          A workable version needs reputation that cannot be manufactured — a
          web of trust over the mesh, where a flag from someone whose key you
          have seen corroborated a hundred times counts differently from a
          stranger's. That is real work, so it is designed rather than faked.
        </Body>
      </Card>

      <Button
        label="Submit report"
        disabled={!selected}
        onPress={() =>
          Alert.alert(
            'Design preview',
            'Nothing was submitted. This screen is a mockup — see the note above for why it is not wired to the mesh.',
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  list: {gap: spacing.sm},
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.base,
  },
  reasonSelected: {borderColor: colors.primary},
  radio: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  radioSelected: {borderColor: colors.primary, backgroundColor: colors.primary},
  reasonText: {...type.bodySm, flex: 1, color: colors.onSurface},

  why: {backgroundColor: colors.surfaceContainerLow, gap: spacing.sm},
  whyTitle: {...type.button, color: colors.onSurface},
  whyText: {...type.bodySm, color: colors.onSurfaceVariant},
});
