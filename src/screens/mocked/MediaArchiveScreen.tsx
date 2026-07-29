/**
 * Media archive — **mocked**.
 *
 * The motivation is real and specific: during the July 2024 crackdown, people
 * with gunshot wounds were buried without identification. An archive of
 * timestamped, signed evidence that survives a phone being seized is a genuine
 * need.
 *
 * It is not built here because a photo is ~2MB and a legacy BLE advertisement
 * carries about 20 usable bytes. That is roughly 100,000 frames — six hours of
 * continuous airtime for one image. The constraint is stated on the screen
 * rather than hidden, because "why not photos?" is the first question anyone
 * asks and the answer is interesting.
 */

import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppStatusBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {
  Body,
  Card,
  Headline,
  Label,
  MockBanner,
} from '../../components/primitives';
import {colors, radius, spacing, type} from '../../theme/tokens';

const ITEMS = [
  {label: 'Shahbagh, 14:32', kind: 'Photo'},
  {label: 'Voice note, 14:40', kind: 'Audio'},
  {label: 'TSC junction, 15:02', kind: 'Photo'},
  {label: 'Curzon Hall, 15:20', kind: 'Photo'},
] as const;

export function MediaArchiveScreen(): React.JSX.Element {
  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <Headline>Evidence archive</Headline>
      <MockBanner feature="the media archive" />

      <View style={styles.grid}>
        {ITEMS.map(item => (
          <View key={item.label} style={styles.tile}>
            <View style={styles.tilePreview}>
              <Icon
                name={item.kind === 'Audio' ? 'feed' : 'camera'}
                size={26}
                color={colors.secondary}
              />
            </View>
            <Label>{item.label}</Label>
          </View>
        ))}
      </View>

      <Card style={styles.why}>
        <Body style={styles.whyTitle}>Why this is not built</Body>
        <Body style={styles.whyText}>
          A photo is around 2MB. A legacy Bluetooth advertisement carries about
          20 usable bytes, so one image is roughly 100,000 frames — about six
          hours of continuous airtime, during which nothing else could be sent.
        </Body>
        <Body style={styles.whyText}>
          Making this real needs a different transport for bulk data: a direct
          WiFi transfer between two phones that are already near each other,
          with the mesh used only to announce that the file exists. That is a
          separate piece of engineering, not a missing button.
        </Body>
      </Card>

      <Card style={styles.motive}>
        <Body style={styles.whyText}>
          The need is real. During the July 2024 crackdown people were buried
          without identification. Timestamped, signed evidence that survives a
          phone being seized is exactly what was missing — which is why this is
          designed rather than dropped.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  tile: {width: '48%', gap: spacing.xs, opacity: 0.7},
  tilePreview: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  why: {backgroundColor: colors.surfaceContainerLow, gap: spacing.sm},
  whyTitle: {...type.button, color: colors.onSurface},
  whyText: {...type.bodySm, color: colors.onSurfaceVariant},
  motive: {backgroundColor: colors.surfaceContainerLow},
});
