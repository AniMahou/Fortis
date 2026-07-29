import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import nacl from 'tweetnacl';
import {AppStatusBar, BackBar, Screen} from '../../../components/Screen';
import {
  Body,
  Button,
  Card,
  Headline,
  Label,
} from '../../../components/primitives';
import {Icon} from '../../../components/Icon';
import {getServices} from '../../../app/services';
import {useIdentityStore} from '../../../state/identityStore';
import type {RootStackParamList} from '../../../navigation/types';
import {
  NICKNAME_MAX_LENGTH,
  isValidNickname,
  suggestNickname,
} from './nickname';
import {colors, radius, spacing, type} from '../../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'SetNickname'>;

export function SetNicknameScreen({navigation}: Props): React.JSX.Element {
  const [suggestion, setSuggestion] = useState(() =>
    suggestNickname(nacl.randomBytes),
  );
  const [nickname, setNickname] = useState('');
  const setStoreNickname = useIdentityStore(state => state.setNickname);
  const fingerprint = useIdentityStore(state => state.fingerprint);

  const value = nickname.length > 0 ? nickname : suggestion;
  const valid = useMemo(() => isValidNickname(value), [value]);

  const onContinue = () => {
    const vault = getServices()?.storage.vault;
    if (!vault || !valid) return;
    setStoreNickname(vault, value);
    navigation.navigate('SetPin');
  };

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />
      <BackBar title="" onBack={() => navigation.goBack()} />

      <View style={styles.hero}>
        <Headline>Choose a temporary nickname</Headline>
        <Body muted>
          This is the label other people see on the mesh. It is not your
          identity and it proves nothing — anyone can pick any nickname.
        </Body>
      </View>

      <View style={styles.field}>
        <Label>Nickname</Label>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder={suggestion}
          placeholderTextColor={colors.secondary}
          maxLength={NICKNAME_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Nickname"
        />
        <View style={styles.fieldFooter}>
          <Pressable
            onPress={() => {
              setSuggestion(suggestNickname(nacl.randomBytes));
              setNickname('');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Suggest another nickname"
            style={styles.suggest}>
            <Icon name="refresh" size={14} color={colors.onSurfaceVariant} />
            <Label>Suggest another</Label>
          </Pressable>
          <Label>
            {value.length}/{NICKNAME_MAX_LENGTH}
          </Label>
        </View>
      </View>

      <Card style={styles.tip}>
        <View style={styles.tipRow}>
          <Icon name="info" size={18} color={colors.onSurfaceVariant} />
          <Body style={styles.tipText}>
            Avoid your real name if you are somewhere public. A handle you have
            not used elsewhere is safest — a nickname reused from another
            platform links this device to that account.
          </Body>
        </View>
      </Card>

      {/*
        The distinction CONTEXT.md draws between display identity and
        cryptographic identity, made visible. The nickname is a label; the
        fingerprint is what the mesh actually verifies against.
      */}
      {fingerprint && (
        <Card>
          <Label>Your device key</Label>
          <Body style={styles.fingerprint}>{fingerprint}</Body>
          <Body muted style={styles.fingerprintNote}>
            This, not your nickname, is what identifies your messages. It was
            generated on this phone and never leaves it. A panic wipe destroys
            it and the next launch generates a new, unlinkable one.
          </Body>
        </Card>
      )}

      <Button label="Continue" onPress={onContinue} disabled={!valid} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  hero: {gap: spacing.sm},
  field: {gap: spacing.sm},
  input: {
    ...type.bodyLg,
    color: colors.onSurface,
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: radius.md,
    backgroundColor: colors.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  fieldFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggest: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2},
  tip: {backgroundColor: colors.surfaceContainerLow},
  tipRow: {flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start'},
  tipText: {...type.bodySm, color: colors.onSurfaceVariant, flex: 1},
  fingerprint: {
    ...type.headlineMd,
    fontFamily: 'monospace',
    marginTop: spacing.xs,
    color: colors.primary,
  },
  fingerprintNote: {...type.bodySm, marginTop: spacing.sm},
});
