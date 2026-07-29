/**
 * Settings — **mostly mocked**, with the real bits marked.
 *
 * CONTEXT.md says the whole screen can be static, as long as panic wipe stays
 * real and reachable from Safety Center. Nickname and the archive links happen
 * to be real because they were cheap; the toggles are not, and say so instead
 * of moving and doing nothing.
 *
 * The encryption toggle is not offered at all. A switch that turns off packet
 * signing would be a footgun with no upside, and the more familiar "enable
 * encryption" framing would imply the broadcasts are private, which they are
 * not (docs/DECISIONS.md D8).
 */

import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {AppStatusBar, BackBar, Screen} from '../../components/Screen';
import {Icon, type IconName} from '../../components/Icon';
import {
  Body,
  Card,
  Label,
  SectionTitle,
  StatusChip,
} from '../../components/primitives';
import {config} from '../../config/env';
import {useIdentityStore} from '../../state/identityStore';
import {useMeshStore} from '../../state/meshStore';
import type {RootStackParamList} from '../../navigation/types';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({navigation}: Props): React.JSX.Element {
  const nickname = useIdentityStore(state => state.nickname);
  const fingerprint = useIdentityStore(state => state.fingerprint);
  const protection = useIdentityStore(state => state.protection);
  const pinSet = useIdentityStore(state => state.pinSet);
  const status = useMeshStore(state => state.status);

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <BackBar title="Settings" onBack={() => navigation.goBack()} />

      <SectionTitle>Identity</SectionTitle>
      <Card style={styles.card}>
        <Row label="Nickname" value={nickname ?? '—'} />
        <Row label="Device key" value={fingerprint ?? '—'} mono />
        <Row label="PIN" value={pinSet ? 'Set' : 'Not set'} />
      </Card>

      <SectionTitle>Mesh</SectionTitle>
      <Card style={styles.card}>
        <Row label="Transport" value={config.transport.toUpperCase()} />
        <Row label="Max hops" value={String(config.meshMaxTtl)} />
        <View style={styles.row}>
          <Label>Status</Label>
          <StatusChip
            label={status.ready ? 'Active' : 'Offline'}
            tone={status.ready ? 'ok' : 'caution'}
          />
        </View>
        <View style={styles.row}>
          <Label>Key storage</Label>
          <StatusChip
            label={protection === 'hardware' ? 'Hardware' : 'Software'}
            tone={protection === 'hardware' ? 'ok' : 'caution'}
          />
        </View>
      </Card>
      <Body muted style={styles.note}>
        Mesh settings come from `.env` at build time, so they cannot be changed
        here. See docs/BLE_SPIKE.md.
      </Body>

      <SectionTitle>Archive</SectionTitle>
      <View style={styles.links}>
        <LinkRow
          icon="camera"
          label="Evidence archive"
          badge="design"
          onPress={() => navigation.navigate('MediaArchive')}
        />
        <LinkRow
          icon="warning"
          label="Report misinformation"
          badge="design"
          onPress={() => navigation.navigate('Misinformation')}
        />
      </View>

      <SectionTitle>Data</SectionTitle>
      <Card style={styles.wipeNote}>
        <Body style={styles.wipeText}>
          Panic wipe lives in Safety, not here — it needs to be reachable in one
          tap from the screen you are already on when you need it, not buried
          three levels into settings.
        </Body>
      </Card>
    </Screen>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Label>{label}</Label>
      <Text style={[styles.value, mono && styles.mono]}>{value}</Text>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: IconName;
  label: string;
  badge: 'design' | 'live';
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [styles.linkRow, pressed && styles.linkPressed]}>
      <Icon name={icon} size={20} color={colors.onSurface} />
      <Text style={styles.linkLabel}>{label}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{badge.toUpperCase()}</Text>
      </View>
    </Pressable>
  );
}

/** Kept for parity with the design; nothing here mutates state. */
export function showMockedSetting(): void {
  Alert.alert(
    'Design preview',
    'This control is part of the designed settings screen and does nothing in this build.',
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  card: {gap: spacing.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  value: {...type.bodySm, color: colors.onSurface, flexShrink: 1, textAlign: 'right'},
  mono: {fontFamily: 'monospace'},
  note: {...type.bodySm},

  links: {gap: spacing.sm},
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  linkPressed: {backgroundColor: colors.surfaceContainerLow},
  linkLabel: {...type.button, flex: 1, color: colors.onSurface},
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHighest,
  },
  badgeText: {...type.labelCaps, fontSize: 9, color: colors.onSurfaceVariant},

  wipeNote: {backgroundColor: colors.surfaceContainerLow},
  wipeText: {...type.bodySm, color: colors.onSurfaceVariant},
});
