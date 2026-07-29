import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {AppStatusBar, BackBar, Screen} from '../../../components/Screen';
import {
  Body,
  Button,
  Card,
  Headline,
  InfoCard,
} from '../../../components/primitives';
import {Icon} from '../../../components/Icon';
import {
  checkPermissions,
  describeMissing,
  requestMeshPermissions,
  type PermissionState,
} from '../../../app/permissions';
import type {RootStackParamList} from '../../../navigation/types';
import {colors, spacing, type} from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Permissions'>;

/**
 * Asks for exactly what the mesh needs, and nothing else.
 *
 * The Stitch design lists Camera & Microphone alongside the others. They are
 * not requested here: photos and voice notes are in CONTEXT.md's *mocked* set,
 * so there is no code behind them. Asking for a permission the app cannot use
 * would be a bad look for a tool whose entire pitch is that it collects
 * nothing — and it is exactly the kind of over-request that makes people
 * distrust an app they are relying on for their safety.
 */
export function PermissionsScreen({navigation}: Props): React.JSX.Element {
  const [state, setState] = useState<PermissionState | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void checkPermissions().then(setState);
  }, []);

  const onAllow = async () => {
    setAsking(true);
    try {
      setState(await requestMeshPermissions());
    } finally {
      setAsking(false);
    }
  };

  const missing = state ? describeMissing(state) : null;

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <BackBar title="" onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <Headline>Two permissions, and that is all</Headline>
        <Body muted>
          VOX asks for the minimum the mesh needs to work. Nothing here is used
          for anything else, and there is nowhere for it to be sent.
        </Body>
      </View>

      <View style={styles.cards}>
        <InfoCard
          icon="bluetooth"
          title={
            state?.bluetooth ? 'Bluetooth — granted' : 'Bluetooth — needed'
          }
          body="Finds nearby phones and passes messages between them. This is the mesh."
          tone={state?.bluetooth ? 'neutral' : 'caution'}
        />
        <InfoCard
          icon="location"
          title={state?.location ? 'Location — granted' : 'Location — needed'}
          body="Attaches a position to an SOS or a danger report. Android also requires it before it will report nearby Bluetooth devices at all."
          tone={state?.location ? 'neutral' : 'caution'}
        />
      </View>

      <Card style={styles.notAsked}>
        <View style={styles.notAskedRow}>
          <Icon name="person-off" size={18} color={colors.onSurfaceVariant} />
          <Body style={styles.notAskedText}>
            Not requested: camera, microphone, contacts, storage, phone state.
            Photos and voice notes are shown as designs in this build and have
            no code behind them, so VOX does not ask for access it would not
            use.
          </Body>
        </View>
      </Card>

      {missing && (
        <Card style={styles.warning}>
          <Body style={styles.warningText}>{missing}</Body>
        </Card>
      )}

      <View style={styles.actions}>
        <Button
          label={state?.meshUsable ? 'Permissions granted' : 'Allow'}
          icon={state?.meshUsable ? 'check' : undefined}
          onPress={onAllow}
          loading={asking}
          disabled={state?.meshUsable === true}
        />
        <Button
          label={state?.meshUsable ? 'Continue' : 'Continue without'}
          variant={state?.meshUsable ? 'primary' : 'secondary'}
          onPress={() => navigation.navigate('SetupComplete')}
          hint={
            state?.meshUsable
              ? undefined
              : 'VOX will open, but cannot reach nearby phones until permissions are granted'
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  hero: {gap: spacing.sm},
  cards: {gap: spacing.sm},
  notAsked: {backgroundColor: colors.surfaceContainerLow},
  notAskedRow: {flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start'},
  notAskedText: {...type.bodySm, color: colors.onSurfaceVariant, flex: 1},
  warning: {backgroundColor: colors.surfaceContainerHigh},
  warningText: {...type.bodySm, color: colors.onSurface},
  actions: {gap: spacing.sm, marginTop: spacing.sm},
});
