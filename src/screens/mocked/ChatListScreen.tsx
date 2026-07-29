/**
 * Chat list — **mocked**, with one real row at the top.
 *
 * This is where the real/mocked boundary is most visible, and deliberately so.
 * "Private encrypted group chat" is in CONTEXT.md's mocked set. The live mesh
 * broadcast is real. Putting both on one screen, each labelled, means the demo
 * can point at the difference rather than talk around it: the top row is live
 * traffic between actual phones, everything below is the interface designed for
 * a fuller version.
 *
 * The mocked conversations are obviously placeholder — timestamps do not tick,
 * unread counts do not change, and tapping one says so.
 */

import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {AppStatusBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {
  Body,
  Headline,
  Label,
  MockBanner,
  SectionTitle,
} from '../../components/primitives';
import {useMeshStore} from '../../state/meshStore';
import type {RootStackParamList} from '../../navigation/types';
import {relativeTime} from '../real/DashboardScreen';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MOCK_THREADS = [
  {
    name: 'Emergency Response Alpha',
    preview: 'Deploying relay now.',
    when: 'Mon',
    unread: 12,
    group: true,
  },
  {
    name: 'Marcus Chen',
    preview: 'The mesh nodes are calibrated for the north sector.',
    when: '12:42',
    unread: 2,
    group: false,
  },
  {
    name: 'Sarah Miller',
    preview: 'Did you see the updated topology map?',
    when: 'Yesterday',
    unread: 0,
    group: false,
  },
  {
    name: 'David Kim',
    preview: "I'll be out of range for the next 4 hours.",
    when: 'Sunday',
    unread: 0,
    group: false,
  },
] as const;

export function ChatListScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const messages = useMeshStore(state => state.messages);
  const peers = useMeshStore(state => state.peers);

  const latest = messages.at(-1);

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <Headline>Messages</Headline>

      <SectionTitle>Live</SectionTitle>

      <Pressable
        onPress={() => navigation.navigate('MeshRelay')}
        accessibilityRole="button"
        accessibilityLabel="Open mesh broadcast"
        style={({pressed}) => [
          styles.row,
          styles.liveRow,
          pressed && styles.rowPressed,
        ]}>
        <View style={[styles.avatar, styles.liveAvatar]}>
          <Icon name="feed" size={20} color={colors.onPrimary} />
        </View>
        <View style={styles.rowText}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowTitle}>Mesh broadcast</Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>
          <Text style={styles.rowPreview} numberOfLines={1}>
            {latest
              ? latest.text
              : peers.length > 0
                ? `${peers.length} ${peers.length === 1 ? 'phone' : 'phones'} in range`
                : 'No phones in range yet'}
          </Text>
        </View>
        <Label>{latest ? relativeTime(latest.sentAt) : ''}</Label>
      </Pressable>

      <SectionTitle>Designed, not built</SectionTitle>
      <MockBanner feature="private and group chat" />

      <View style={styles.list}>
        {MOCK_THREADS.map(thread => (
          <Pressable
            key={thread.name}
            onPress={() =>
              Alert.alert(
                'Design preview',
                `"${thread.name}" is a mockup. One-to-one and group chat over the mesh is designed but not built in this version — the live mesh broadcast above is the working feature.`,
              )
            }
            accessibilityRole="button"
            accessibilityLabel={`${thread.name}, design preview`}
            style={({pressed}) => [
              styles.row,
              styles.mockRow,
              pressed && styles.rowPressed,
            ]}>
            <View style={styles.avatar}>
              <Icon
                name={thread.group ? 'person' : 'chat'}
                size={18}
                color={colors.onSurfaceVariant}
              />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{thread.name}</Text>
              <Text style={styles.rowPreview} numberOfLines={1}>
                {thread.preview}
              </Text>
            </View>
            <View style={styles.rowMeta}>
              <Label>{thread.when}</Label>
              {thread.unread > 0 && (
                <View style={styles.unread}>
                  <Text style={styles.unreadText}>{thread.unread}</Text>
                </View>
              )}
            </View>
          </Pressable>
        ))}
      </View>

      <Body muted style={styles.footnote}>
        Group chat was cut from this build on purpose, to spend the time
        hardening the mesh relay everything else depends on. See CONTEXT.md
        section 4.
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  list: {gap: spacing.sm},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 4,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  liveRow: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: colors.primary,
  },
  mockRow: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: colors.outlineVariant,
    opacity: 0.75,
  },
  rowPressed: {backgroundColor: colors.surfaceContainerLow},
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveAvatar: {backgroundColor: colors.primary},
  rowText: {flex: 1, gap: 2},
  rowTitleLine: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  rowTitle: {...type.button, color: colors.onSurface},
  rowPreview: {...type.bodySm, color: colors.onSurfaceVariant},
  rowMeta: {alignItems: 'flex-end', gap: spacing.xs},
  liveBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  liveBadgeText: {...type.labelCaps, fontSize: 9, color: colors.onPrimary},
  unread: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {...type.labelCaps, fontSize: 10, color: colors.onSurfaceVariant},
  footnote: {...type.bodySm},
});
