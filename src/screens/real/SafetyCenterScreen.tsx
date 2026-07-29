/**
 * Safety Center.
 *
 * CONTEXT.md flags this Stitch screen as **split**: SOS and Panic Wipe are
 * real; "I'm Safe" reuses the real SOS packet path so it is real too; Dead
 * Man's Switch, Know Your Rights and Trusted Circle are mocked. Each row says
 * which it is, rather than the screen pretending to be one thing.
 *
 * Know Your Rights is deliberately left as an unbuilt placeholder rather than
 * filled with plausible text. CONTEXT.md is emphatic: if it is ever made real
 * it must come from an actual Bangladeshi legal aid organisation such as BLAST
 * or Ain o Salish Kendra. Invented legal advice, or advice borrowed from
 * another country's system, could get someone hurt — that is a worse outcome
 * than an empty screen.
 */

import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React, {useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {AppStatusBar, Screen} from '../../components/Screen';
import {Icon, type IconName} from '../../components/Icon';
import {SosButton} from '../../components/SosButton';
import {
  Body,
  Card,
  Headline,
  Label,
  SectionTitle,
  StatusChip,
} from '../../components/primitives';
import {performPanicWipe, sendImSafe, sendSos} from '../../app/services';
import {useIdentityStore} from '../../state/identityStore';
import {useMeshStore} from '../../state/meshStore';
import type {RootStackParamList} from '../../navigation/types';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function SafetyCenterScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [sending, setSending] = useState(false);
  const [wiping, setWiping] = useState(false);

  const fingerprint = useIdentityStore(state => state.fingerprint);
  const protection = useIdentityStore(state => state.protection);
  const status = useMeshStore(state => state.status);
  const peers = useMeshStore(state => state.peers);

  const onSos = async () => {
    setSending(true);
    try {
      navigation.navigate('SosConfirmation', await sendSos());
    } catch (err) {
      Alert.alert(
        'Could not send SOS',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    } finally {
      setSending(false);
    }
  };

  const confirmWipe = () => {
    Alert.alert(
      'Erase everything on this device?',
      'This destroys your encryption key, your identity, and every message and hazard report stored here.\n\nIt cannot be undone. Nothing is recoverable afterwards, by you or by anyone who takes this phone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: () => void runWipe(),
        },
      ],
    );
  };

  const runWipe = async () => {
    setWiping(true);
    try {
      const report = await performPanicWipe();
      navigation.reset({
        index: 0,
        routes: [{name: 'WipeComplete', params: {report}}],
      });
    } catch (err) {
      Alert.alert(
        'Wipe did not complete',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
      setWiping(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <Headline>Safety</Headline>

      <SosButton onTrigger={onSos} sending={sending} />

      <ActionRow
        icon="check"
        title="I'm safe"
        subtitle="Broadcast that you are no longer in danger"
        badge="live"
        onPress={() => {
          void sendImSafe();
          Alert.alert(
            "'I'm safe' broadcast",
            'Nearby phones have been told you are OK.',
          );
        }}
      />

      <SectionTitle>This device</SectionTitle>

      <Card style={styles.deviceCard}>
        <View style={styles.deviceRow}>
          <Label>Device key</Label>
          <Text style={styles.mono}>{fingerprint ?? '—'}</Text>
        </View>
        <View style={styles.deviceRow}>
          <Label>Key storage</Label>
          <StatusChip
            label={
              protection === 'hardware' ? 'Hardware-backed' : 'Software only'
            }
            tone={protection === 'hardware' ? 'ok' : 'caution'}
          />
        </View>
        <View style={styles.deviceRow}>
          <Label>Mesh</Label>
          <StatusChip
            label={
              status.ready
                ? `${peers.length} ${peers.length === 1 ? 'peer' : 'peers'}`
                : 'Offline'
            }
            tone={status.ready ? 'ok' : 'caution'}
          />
        </View>
      </Card>

      <SectionTitle>Emergency erase</SectionTitle>

      <Pressable
        onPress={confirmWipe}
        disabled={wiping}
        accessibilityRole="button"
        accessibilityLabel="Panic wipe"
        accessibilityHint="Permanently destroys the encryption key and all data on this device"
        style={({pressed}) => [
          styles.wipeCard,
          pressed && styles.wipePressed,
          wiping && styles.wipeDisabled,
        ]}>
        <View style={styles.wipeRow}>
          <View style={styles.wipeIcon}>
            <Icon name="trash" size={22} color={colors.onEmergency} />
          </View>
          <View style={styles.wipeText}>
            <Text style={styles.wipeTitle}>
              {wiping ? 'Erasing…' : 'Panic wipe'}
            </Text>
            <Text style={styles.wipeBody}>
              Destroys the encryption key itself, not just the messages. What is
              left on the phone afterwards cannot be read by anyone.
            </Text>
          </View>
        </View>
      </Pressable>

      <SectionTitle>Not built yet</SectionTitle>
      <Body muted style={styles.mockedNote}>
        These are designed but have no logic behind them in this build.
      </Body>

      <View style={styles.mockedList}>
        <ActionRow
          icon="clock"
          title="Dead man's switch"
          subtitle="Auto-SOS if you do not check in"
          badge="design"
          onPress={notBuilt}
        />
        <ActionRow
          icon="info"
          title="Know your rights"
          subtitle="Needs sourcing from BLAST or Ain o Salish Kendra before it ships"
          badge="design"
          onPress={() =>
            Alert.alert(
              'Deliberately empty',
              'Legal guidance has to come from a real Bangladeshi legal aid organisation. Inventing it, or copying another country’s, could get someone hurt — so this stays empty until it can be sourced properly.',
            )
          }
        />
        <ActionRow
          icon="person"
          title="Trusted circle"
          subtitle="Named contacts who get your alerts first"
          badge="design"
          onPress={notBuilt}
        />
      </View>
    </Screen>
  );
}

function notBuilt() {
  Alert.alert(
    'Design preview',
    'This screen exists as a design. It is not wired to the mesh in this build — see the scope note in CONTEXT.md.',
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  badge: 'live' | 'design';
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({pressed}) => [styles.actionRow, pressed && styles.actionPressed]}>
      <View style={styles.actionIcon}>
        <Icon name={icon} size={20} color={colors.onSurface} />
      </View>
      <View style={styles.actionText}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.badge, badge === 'live' && styles.badgeLive]}>
        <Text style={[styles.badgeText, badge === 'live' && styles.badgeTextLive]}>
          {badge === 'live' ? 'LIVE' : 'DESIGN'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},

  deviceCard: {gap: spacing.sm},
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mono: {...type.bodySm, fontFamily: 'monospace', color: colors.onSurface},

  wipeCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.emergency,
    backgroundColor: colors.base,
    padding: spacing.md,
  },
  wipePressed: {backgroundColor: colors.surfaceContainerLow},
  wipeDisabled: {opacity: 0.6},
  wipeRow: {flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start'},
  wipeIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.emergency,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wipeText: {flex: 1, gap: 2},
  wipeTitle: {...type.headlineMd, color: colors.emergency},
  wipeBody: {...type.bodySm, color: colors.onSurfaceVariant},

  mockedNote: {...type.bodySm},
  mockedList: {gap: spacing.sm},
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  actionPressed: {backgroundColor: colors.surfaceContainerLow},
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {flex: 1},
  actionTitle: {...type.button, color: colors.onSurface},
  actionSubtitle: {...type.bodySm, color: colors.onSurfaceVariant},
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHighest,
  },
  badgeLive: {backgroundColor: colors.primary},
  badgeText: {...type.labelCaps, fontSize: 9, color: colors.onSurfaceVariant},
  badgeTextLive: {color: colors.onPrimary},
});
