import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppStatusBar, Screen} from '../../../components/Screen';
import {
  Body,
  Button,
  Headline,
  InfoCard,
  StatusChip,
} from '../../../components/primitives';
import {Icon} from '../../../components/Icon';
import {getServices} from '../../../app/services';
import {useIdentityStore} from '../../../state/identityStore';
import {useMeshStore} from '../../../state/meshStore';
import type {RootStackParamList} from '../../../navigation/types';
import {colors, radius, spacing, type} from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'SetupComplete'>;

export function SetupCompleteScreen({navigation}: Props): React.JSX.Element {
  const nickname = useIdentityStore(state => state.nickname);
  const fingerprint = useIdentityStore(state => state.fingerprint);
  const protection = useIdentityStore(state => state.protection);
  const completeOnboarding = useIdentityStore(state => state.completeOnboarding);
  const status = useMeshStore(state => state.status);

  const onGo = () => {
    const vault = getServices()?.storage.vault;
    if (vault) completeOnboarding(vault);
    navigation.reset({index: 0, routes: [{name: 'Main'}]});
  };

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />

      <View style={styles.hero}>
        <View style={styles.check}>
          <Icon name="check" size={32} color={colors.primary} />
        </View>
        <Headline style={styles.heading}>You're on the mesh</Headline>
        <Body muted style={styles.lede}>
          You are <Body style={styles.nickname}>{nickname}</Body> to anyone
          nearby. No account was created, and nothing was sent anywhere.
        </Body>
      </View>

      <View style={styles.cards}>
        <InfoCard
          icon="key"
          title="Your device key"
          body={`${fingerprint ?? '—'} — every message you send is signed with this, so it cannot be forged or altered by a relaying phone.`}
        />
        <InfoCard
          icon="lock"
          title={
            protection === 'hardware'
              ? 'Hardware-backed storage'
              : 'Software-protected storage'
          }
          body={
            protection === 'hardware'
              ? 'Your encryption key is held in this phone’s secure element and cannot be extracted. Panic wipe destroys it permanently.'
              : 'This device has no usable hardware keystore, so the encryption key is stored directly. Panic wipe still removes it, but offers less protection against forensic recovery.'
          }
          tone={protection === 'hardware' ? 'neutral' : 'caution'}
        />
        <InfoCard
          icon="wifi-off"
          title="No internet needed from here"
          body="Turn off mobile data and WiFi if you like. VOX does not use them."
        />
      </View>

      {/* The real transport state, not a decorative "connected" badge. */}
      <View style={styles.statusRow}>
        <StatusChip
          label={status.ready ? 'Mesh active' : 'Mesh not ready'}
          tone={status.ready ? 'ok' : 'caution'}
        />
        {status.detail && (
          <Body muted style={styles.statusDetail}>
            {status.detail}
          </Body>
        )}
      </View>

      <Button label="Go to dashboard" icon="arrow-right" onPress={onGo} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, paddingTop: spacing.lg},
  hero: {alignItems: 'center', gap: spacing.sm},
  check: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {textAlign: 'center'},
  lede: {textAlign: 'center'},
  nickname: {...type.bodyLg, fontWeight: '700', color: colors.onSurface},
  cards: {gap: spacing.sm},
  statusRow: {alignItems: 'center', gap: spacing.xs},
  statusDetail: {...type.bodySm, textAlign: 'center'},
});
