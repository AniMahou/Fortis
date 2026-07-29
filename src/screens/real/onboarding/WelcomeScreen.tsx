import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {AppStatusBar, Screen} from '../../../components/Screen';
import {Body, Button, Headline, InfoCard} from '../../../components/primitives';
import type {RootStackParamList} from '../../../navigation/types';
import {colors, spacing, type} from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

export function WelcomeScreen({navigation}: Props): React.JSX.Element {
  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />

      <View style={styles.hero}>
        <Headline style={styles.heading}>
          Stay Connected.{'\n'}Stay Safe. Stay Informed.
        </Headline>
        <Body muted style={styles.lede}>
          VOX works without internet. Your phone talks directly to other phones
          nearby over Bluetooth and passes messages along, hop by hop, until
          they reach someone who needs them.
        </Body>
      </View>

      <View style={styles.cards}>
        <InfoCard
          icon="wifi-off"
          title="No internet, no towers, no server"
          body="Nothing VOX does depends on infrastructure that can be switched off."
        />
        <InfoCard
          icon="person-off"
          title="No personal data, ever"
          body="No phone number, no email, no account. Not even your device's identifiers."
        />
        <InfoCard
          icon="key"
          title="Signed, so it can be trusted"
          body="Every message is cryptographically signed, so a relaying phone cannot alter it."
        />
      </View>

      <View style={styles.actions}>
        <Button
          label="Get started"
          icon="arrow-right"
          onPress={() => navigation.navigate('PrivacyWarning')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.lg, paddingTop: spacing.lg},
  hero: {gap: spacing.md},
  heading: {...type.headlineLg, color: colors.primary},
  lede: {lineHeight: 24},
  cards: {gap: spacing.sm},
  actions: {gap: spacing.sm},
});
