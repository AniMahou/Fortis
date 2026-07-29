import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {AppStatusBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {
  Body,
  Button,
  Card,
  Headline,
  InfoCard,
  Label,
  StatusChip,
} from '../../components/primitives';
import {sendImSafe} from '../../app/services';
import {useMeshStore} from '../../state/meshStore';
import type {RootStackParamList} from '../../navigation/types';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'SosConfirmation'>;

/**
 * What happened after an SOS, stated accurately.
 *
 * The Stitch design says "Help is on the way" and "your location was broadcast
 * to 47 nearby devices". Neither is something this app can know. A broadcast
 * mesh has no acknowledgements — nobody confirms receipt — and there is no way
 * to tell whether anyone acted on it.
 *
 * So this screen reports what is actually true: the packet was signed and put
 * on the air, N phones were in range when it went out, and it will keep being
 * rebroadcast. Someone in danger is owed the truth about what their phone did
 * and did not do, more than they are owed reassurance.
 */
export function SosConfirmationScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const {position, sentAt, peerCount} = route.params;
  const [markingSafe, setMarkingSafe] = useState(false);
  const peers = useMeshStore(state => state.peers);

  const timestamp = new Date(sentAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const onSafe = async () => {
    setMarkingSafe(true);
    try {
      await sendImSafe();
      navigation.goBack();
    } finally {
      setMarkingSafe(false);
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />

      <View style={styles.hero}>
        <View style={styles.badge}>
          <Icon name="sos" size={30} color={colors.onEmergency} />
        </View>
        <Headline style={styles.heading}>SOS broadcast</Headline>
        <Body muted style={styles.lede}>
          Your signal is on the air and nearby phones are passing it along.
        </Body>
      </View>

      <Card style={styles.detail}>
        <Row label="Sent at" value={timestamp} />
        <Row
          label="Position"
          value={`${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`}
        />
        <Row label="Accuracy" value={`±${Math.round(position.accuracy)}m`} />
        <Row
          label="In range when sent"
          value={`${peerCount} ${peerCount === 1 ? 'phone' : 'phones'}`}
        />
        <Row
          label="In range now"
          value={`${peers.length} ${peers.length === 1 ? 'phone' : 'phones'}`}
        />
      </Card>

      {position.stale && (
        <Card style={styles.staleCard}>
          <View style={styles.staleRow}>
            <Icon name="clock" size={18} color={colors.caution} />
            <Body style={styles.staleText}>
              This is your last known position, not a fresh fix — GPS could not
              get one in time. If you have moved since, the position sent is
              wrong.
            </Body>
          </View>
        </Card>
      )}

      {peerCount === 0 && (
        <Card style={styles.warningCard}>
          <Body style={styles.warningText}>
            No phones were in range when this went out. VOX is still
            broadcasting, so it will reach anyone who comes within range — but
            nobody has heard it yet.
          </Body>
        </Card>
      )}

      <InfoCard
        icon="info"
        title="What VOX cannot tell you"
        body="A mesh broadcast has no delivery receipt. Nobody's phone confirms it arrived, so this screen cannot say whether help is coming — only that the signal went out and is still going out."
      />

      <View style={styles.statusRow}>
        <StatusChip label="Still broadcasting" tone="emergency" />
      </View>

      <View style={styles.actions}>
        <Button
          label="I'm safe now"
          icon="check"
          onPress={onSafe}
          loading={markingSafe}
          hint="Broadcasts that you are no longer in danger"
        />
        <Button
          label="Back to dashboard"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      </View>
    </Screen>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Label>{label}</Label>
      <Body style={styles.rowValue}>{value}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, paddingTop: spacing.md},
  hero: {alignItems: 'center', gap: spacing.sm},
  badge: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.emergency,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {textAlign: 'center'},
  lede: {textAlign: 'center'},

  detail: {gap: spacing.sm},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md},
  rowValue: {...type.bodySm, color: colors.onSurface, fontFamily: 'monospace'},

  staleCard: {backgroundColor: colors.surfaceContainerHigh},
  staleRow: {flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start'},
  staleText: {...type.bodySm, color: colors.onSurface, flex: 1},

  warningCard: {backgroundColor: colors.surfaceContainerHigh},
  warningText: {...type.bodySm, color: colors.onSurface},

  statusRow: {alignItems: 'center'},
  actions: {gap: spacing.sm},
});
