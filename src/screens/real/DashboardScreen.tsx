/**
 * The main hub.
 *
 * Every number on this screen is a real count. CONTEXT.md is explicit that the
 * mockup's "47 DEVICES" is a placeholder and not a target, and that fabricating
 * plausible-looking figures is worse than omitting them — a judge who asks
 * "where does that number come from?" should get a straight answer.
 *
 * So: peers are phones actually heard from inside the timeout window; messages
 * and alerts are what is actually in the store; network health is derived from
 * the peer count and the transport's own reported state. With no phones in
 * range this screen says so, plainly, rather than showing a comforting number.
 */

import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React, {useMemo, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {AppHeader, AppStatusBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {SosButton} from '../../components/SosButton';
import {
  Body,
  Card,
  EmptyState,
  HopBadge,
  Label,
  SectionTitle,
} from '../../components/primitives';
import {DebugOverlay} from '../../components/DebugOverlay';
import {sendSos} from '../../app/services';
import {useIdentityStore} from '../../state/identityStore';
import {useMeshStore} from '../../state/meshStore';
import {activeDangerPins} from '../../state/meshModel';
import type {RootStackParamList} from '../../navigation/types';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Health from what we can actually observe: peers reachable, transport state. */
function networkHealth(peerCount: number, ready: boolean) {
  if (!ready) return {label: 'Mesh offline', segments: 0, tone: 'caution' as const};
  if (peerCount === 0) {
    return {label: 'No phones in range', segments: 0, tone: 'caution' as const};
  }
  if (peerCount === 1) {
    return {label: 'One peer — fragile', segments: 3, tone: 'caution' as const};
  }
  if (peerCount < 4) {
    return {label: 'Small mesh', segments: 6, tone: 'ok' as const};
  }
  return {label: 'Mesh healthy', segments: 10, tone: 'ok' as const};
}

export function DashboardScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [sending, setSending] = useState(false);
  const [debugVisible, setDebugVisible] = useState(false);

  const nickname = useIdentityStore(state => state.nickname);
  const peers = useMeshStore(state => state.peers);
  const status = useMeshStore(state => state.status);
  const messages = useMeshStore(state => state.messages);
  const dangerPins = useMeshStore(state => state.dangerPins);

  const activeHazards = useMemo(
    () => activeDangerPins(dangerPins, Date.now()).length,
    [dangerPins],
  );
  const health = networkHealth(peers.length, status.ready);
  const recent = useMemo(() => [...messages].reverse().slice(0, 4), [messages]);

  const onSos = async () => {
    setSending(true);
    try {
      const result = await sendSos();
      navigation.navigate('SosConfirmation', result);
    } catch (err) {
      Alert.alert(
        'Could not send SOS',
        err instanceof Error
          ? `${err.message}\n\nCheck that Location is switched on and permission is granted.`
          : 'Something went wrong attaching your position.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <AppHeader
        peerCount={peers.length}
        onLongPressLogo={() => setDebugVisible(true)}
      />

      <View style={styles.identityRow}>
        <Icon name="person" size={16} color={colors.onSurfaceVariant} />
        <Label>{nickname ?? 'Anonymous'}</Label>
      </View>

      <Card style={styles.health}>
        <View style={styles.healthHeader}>
          <Label>{health.label}</Label>
          <Text style={styles.healthCount}>
            {peers.length} {peers.length === 1 ? 'peer' : 'peers'}
          </Text>
        </View>
        <View style={styles.segments}>
          {Array.from({length: 10}, (_, index) => (
            <View
              key={index}
              style={[
                styles.segment,
                index < health.segments && styles.segmentOn,
              ]}
            />
          ))}
        </View>
        {status.detail && (
          <Body muted style={styles.healthDetail}>
            {status.detail}
          </Body>
        )}
      </Card>

      <SosButton onTrigger={onSos} sending={sending} />

      <View style={styles.stats}>
        <StatCard
          icon="person"
          value={peers.length}
          label="Nearby"
          onPress={() => navigation.navigate('MeshRelay')}
        />
        <StatCard
          icon="chat"
          value={messages.length}
          label="Messages"
          onPress={() => navigation.navigate('MeshRelay')}
        />
        <StatCard
          icon="warning"
          value={activeHazards}
          label="Hazards"
          tone={activeHazards > 0 ? 'emergency' : 'neutral'}
        />
      </View>

      <SectionTitle
        action={
          <Pressable
            onPress={() => navigation.navigate('MeshRelay')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open mesh relay">
            <Label>Open</Label>
          </Pressable>
        }>
        Mesh feed
      </SectionTitle>

      {recent.length === 0 ? (
        <Card>
          <EmptyState
            icon="feed"
            title="Nothing heard yet"
            body={
              peers.length === 0
                ? 'No phones in range. VOX will show messages as soon as another device is nearby.'
                : 'Connected, but nobody has broadcast anything yet.'
            }
          />
        </Card>
      ) : (
        <View style={styles.feed}>
          {recent.map(message => (
            <Card key={message.id} style={styles.feedCard}>
              <View style={styles.feedHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {message.mine ? 'YOU' : message.senderId.slice(0, 2)}
                  </Text>
                </View>
                <View style={styles.feedMeta}>
                  <Text style={styles.feedSender} numberOfLines={1}>
                    {message.mine ? 'You' : `Peer ${message.senderId.slice(0, 6)}`}
                  </Text>
                  <Label>{relativeTime(message.sentAt)}</Label>
                </View>
                <HopBadge hopCount={message.hopCount} />
              </View>
              <Body style={styles.feedText}>{message.text}</Body>
            </Card>
          ))}
        </View>
      )}

      <DebugOverlay
        visible={debugVisible}
        onClose={() => setDebugVisible(false)}
      />
    </Screen>
  );
}

function StatCard({
  icon,
  value,
  label,
  tone = 'neutral',
  onPress,
}: {
  icon: 'person' | 'chat' | 'warning';
  value: number;
  label: string;
  tone?: 'neutral' | 'emergency';
  onPress?: () => void;
}): React.JSX.Element {
  const accent =
    tone === 'emergency' ? colors.emergency : colors.onSurfaceVariant;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label}`}
      style={styles.statCard}>
      <Icon name={icon} size={18} color={accent} />
      <Text style={[styles.statValue, tone === 'emergency' && {color: accent}]}>
        {value}
      </Text>
      <Label>{label}</Label>
    </Pressable>
  );
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  identityRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},

  health: {gap: spacing.sm},
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  healthCount: {...type.button, color: colors.onSurface},
  segments: {flexDirection: 'row', gap: 3, height: 10},
  segment: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: colors.surfaceContainerHighest,
  },
  segmentOn: {backgroundColor: colors.primary},
  healthDetail: {...type.bodySm},

  stats: {flexDirection: 'row', gap: spacing.sm},
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  statValue: {...type.headlineMd, color: colors.onSurface},

  feed: {gap: spacing.sm},
  feedCard: {gap: spacing.sm},
  feedHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {...type.labelCaps, fontSize: 10, color: colors.onSurfaceVariant},
  feedMeta: {flex: 1},
  feedSender: {...type.button, color: colors.onSurface},
  feedText: {...type.bodyLg},
});
