import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppStatusBar, BackBar, Screen} from '../../../components/Screen';
import {
  Body,
  Button,
  Headline,
  InfoCard,
  StatusChip,
} from '../../../components/primitives';
import type {RootStackParamList} from '../../../navigation/types';
import {spacing} from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PrivacyWarning'>;

/**
 * The privacy claims, stated precisely.
 *
 * Every line here is something the code actually does, and the wording is
 * deliberately narrower than the marketing version would be. "End-to-end
 * encryption" in particular is *not* claimed: mesh broadcasts are signed and
 * readable by everyone in range, which is the point of a broadcast. Saying
 * otherwise would be the single most misleading thing this app could tell
 * someone who is deciding whether it is safe to use.
 */
export function PrivacyWarningScreen({navigation}: Props): React.JSX.Element {
  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <BackBar title="" onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <Headline>Your privacy is the point</Headline>
        <Body muted>
          The people who need a tool like this are the people a state most wants
          to identify. Here is exactly what VOX does and does not do.
        </Body>
      </View>

      <View style={styles.cards}>
        <InfoCard
          icon="person-off"
          title="No personal data collected"
          body="No name, email or phone number. VOX never reads your IMEI, Android ID or MAC address — using one would make you traceable across a wipe."
        />
        <InfoCard
          icon="storage"
          title="Stored on this device only"
          body="Messages and map pins are encrypted on your phone. There is no server to seize, because there is no server."
        />
        <InfoCard
          icon="key"
          title="Signed, not secret"
          body="Every packet is signed so it cannot be forged or altered in transit. But a mesh broadcast is heard by everyone in range — treat it as speaking aloud in a crowd, not as a private message."
        />
        <InfoCard
          icon="trash"
          title="Panic wipe really wipes"
          body="It destroys the encryption key itself, not just the messages. Once that is gone, what remains on the phone cannot be read by anyone, including us."
        />
      </View>

      <View style={styles.status}>
        <StatusChip label="Anonymous by design" tone="ok" />
      </View>

      <Button
        label="Continue"
        onPress={() => navigation.navigate('SetNickname')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  hero: {gap: spacing.sm},
  cards: {gap: spacing.sm},
  status: {alignItems: 'flex-start'},
});
