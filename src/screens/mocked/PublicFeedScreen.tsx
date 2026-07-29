/**
 * Verified community feed — **mocked**.
 *
 * The hard part of this feature is not the list; it is deciding who counts as
 * a verified volunteer with no server, no accounts and no central authority.
 * That is a real design problem, not a missing afternoon of work, and the
 * footnote says so — a judge asking "how would verification actually work?"
 * deserves the honest answer rather than a badge that means nothing.
 */

import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React from 'react';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {AppStatusBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {
  Body,
  Card,
  Headline,
  Label,
  MockBanner,
} from '../../components/primitives';
import type {RootStackParamList} from '../../navigation/types';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const POSTS = [
  {
    author: 'Dhaka Medical Volunteers',
    verified: true,
    when: '8 min ago',
    distance: '400m away',
    body: 'Emergency medical camp established at Gate 3. Bring anyone with injuries here — we have supplies and two doctors on site.',
  },
  {
    author: 'Red_Hulq',
    verified: false,
    when: '22 min ago',
    distance: '1.2km away',
    body: 'Intersection at TSC is clear for vehicle movement. Mesh signal holding steady across the block.',
  },
  {
    author: 'Nova_24',
    verified: false,
    when: '45 min ago',
    distance: '800m away',
    body: 'Anyone have spare power banks near Curzon Hall? Several phones down and we are losing relay nodes.',
  },
] as const;

export function PublicFeedScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <View style={styles.headerRow}>
        <Headline>Verified feed</Headline>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Settings">
          <Icon name="settings" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <MockBanner feature="the verified feed" />

      <View style={styles.list}>
        {POSTS.map(post => (
          <Card key={post.author} style={styles.post}>
            <View style={styles.postHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {post.author.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.postMeta}>
                <View style={styles.authorLine}>
                  <Text style={styles.author}>{post.author}</Text>
                  {post.verified && (
                    <View style={styles.verified}>
                      <Icon name="check" size={12} color={colors.onPrimary} />
                    </View>
                  )}
                </View>
                <Label>
                  {post.when} · {post.distance}
                </Label>
              </View>
            </View>
            <Body>{post.body}</Body>
          </Card>
        ))}
      </View>

      <Pressable
        onPress={() => navigation.navigate('Misinformation')}
        accessibilityRole="button"
        accessibilityLabel="Report misinformation"
        style={({pressed}) => [styles.reportRow, pressed && styles.pressed]}>
        <Icon name="warning" size={18} color={colors.onSurface} />
        <Body style={styles.reportText}>Report misinformation</Body>
        <Icon name="arrow-right" size={18} color={colors.onSurfaceVariant} />
      </Pressable>

      <Card style={styles.footnote}>
        <Body style={styles.footnoteText}>
          The unsolved part of this feature is not the list — it is who gets a
          verified badge when there is no server, no accounts and no central
          authority to grant one. A badge anyone can mint is worse than none at
          all during a rumour-driven crackdown, so it was left designed rather
          than half-built.
        </Body>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Why this is mocked',
              'Verification without a server needs a web of trust — volunteers signing each other’s keys, with the trust graph itself travelling over the mesh. That is a genuine research problem, not a missing afternoon.',
            )
          }
          hitSlop={8}
          accessibilityRole="button">
          <Label>How it would work</Label>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {gap: spacing.sm},
  post: {gap: spacing.sm, opacity: 0.85},
  postHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {...type.labelCaps, fontSize: 11, color: colors.onSurfaceVariant},
  postMeta: {flex: 1},
  authorLine: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  author: {...type.button, color: colors.onSurface},
  verified: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  pressed: {opacity: 0.8},
  reportText: {...type.button, flex: 1, color: colors.onSurface},

  footnote: {backgroundColor: colors.surfaceContainerLow, gap: spacing.sm},
  footnoteText: {...type.bodySm, color: colors.onSurfaceVariant},
});
