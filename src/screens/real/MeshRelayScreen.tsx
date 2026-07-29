/**
 * The real BLE text relay, in the message-bubble UI from `chat_detail_view`.
 *
 * CONTEXT.md calls this out as a dual use and asks for it to be said aloud in
 * the demo: "private encrypted group chat" is mocked, but this bubble layout is
 * the natural home for the *real* relay, and the hop badge on each bubble is
 * the thing worth showing. So the screen is titled "Mesh broadcast" rather than
 * "Chat", and the header states outright that everyone in range can read it.
 * The UI is reused; the feature claim is not.
 */

import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {decodeUTF8} from 'tweetnacl-util';
import {AppStatusBar, BackBar} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {Body, EmptyState, HopBadge, Label} from '../../components/primitives';
import {sendMeshText} from '../../app/services';
import {MAX_TEXT_BYTES} from '../../mesh/payloads';
import {useMeshStore} from '../../state/meshStore';
import type {MeshMessage} from '../../state/meshModel';
import type {RootStackParamList} from '../../navigation/types';
import {relativeTime} from './DashboardScreen';
import {
  MIN_TOUCH_TARGET,
  colors,
  radius,
  spacing,
  type,
} from '../../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'MeshRelay'>;

export function MeshRelayScreen({navigation}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<MeshMessage>>(null);

  const messages = useMeshStore(state => state.messages);
  const peers = useMeshStore(state => state.peers);
  const status = useMeshStore(state => state.status);

  // Byte length, not character count — Bangla is 3 bytes per character in
  // UTF-8, so a character counter would let a message through that the packet
  // builder then rejects. Measured the same way payloads.ts measures it, so
  // the counter and the validator can never disagree.
  const byteLength = useMemo(() => decodeUTF8(draft).length, [draft]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({animated: true});
    }
  }, [messages.length]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (text === '' || sending) return;
    setSending(true);
    try {
      await sendMeshText(text);
      setDraft('');
    } catch (err) {
      Alert.alert(
        'Could not broadcast',
        err instanceof Error ? err.message : 'Something went wrong.',
      );
    } finally {
      setSending(false);
    }
  }, [draft, sending]);

  return (
    <View style={[styles.screen, {paddingTop: insets.top}]}>
      <AppStatusBar />
      <View style={styles.header}>
        <BackBar title="Mesh broadcast" onBack={() => navigation.goBack()} />
        <View style={styles.warningRow}>
          <Icon name="feed" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.warningText}>
            Everyone in range can read this. Signed, not private.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({item}) => <Bubble message={item} />}
          ListEmptyComponent={
            <EmptyState
              icon="chat"
              title={
                peers.length === 0
                  ? 'No phones in range'
                  : 'Nothing broadcast yet'
              }
              body={
                status.ready
                  ? 'Anything you send goes to every VOX phone nearby, and they pass it on.'
                  : status.detail ?? 'The mesh is not running.'
              }
            />
          }
        />

        <View style={[styles.composer, {paddingBottom: insets.bottom + 8}]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Broadcast to nearby phones"
            placeholderTextColor={colors.secondary}
            style={styles.input}
            multiline
            accessibilityLabel="Message"
          />
          <Pressable
            onPress={onSend}
            disabled={draft.trim() === '' || sending}
            accessibilityRole="button"
            accessibilityLabel="Broadcast"
            style={({pressed}) => [
              styles.sendButton,
              (draft.trim() === '' || sending) && styles.sendDisabled,
              pressed && styles.sendPressed,
            ]}>
            <Icon name="send" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
        {byteLength > MAX_TEXT_BYTES * 0.75 && (
          <Text style={styles.byteCount}>
            {byteLength}/{MAX_TEXT_BYTES} bytes — longer messages take more
            airtime to send
          </Text>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({message}: {message: MeshMessage}): React.JSX.Element {
  return (
    <View style={[styles.bubbleRow, message.mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, message.mine && styles.bubbleMine]}>
        {!message.mine && (
          <Text style={styles.sender}>
            Peer {message.senderId.slice(0, 6)}
          </Text>
        )}
        <Body style={styles.bubbleText}>{message.text}</Body>
        <View style={styles.bubbleFooter}>
          <Label>{relativeTime(message.sentAt)}</Label>
          {/*
            The badge the whole demo is built around. "2 HOPS" is visible proof
            the message travelled through another phone rather than arriving
            straight from its sender.
          */}
          <HopBadge hopCount={message.hopCount} />
          {message.rssi !== null && (
            <Label>{message.rssi} dBm</Label>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surface},
  flex: {flex: 1},
  header: {paddingHorizontal: spacing.margin},
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingBottom: spacing.sm,
  },
  warningText: {...type.bodySm, color: colors.onSurfaceVariant, flex: 1},

  list: {
    paddingHorizontal: spacing.margin,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  bubbleRow: {alignItems: 'flex-start'},
  bubbleRowMine: {alignItems: 'flex-end'},
  bubble: {
    maxWidth: '86%',
    backgroundColor: colors.base,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
    padding: spacing.sm + 4,
    gap: spacing.xs,
  },
  bubbleMine: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.surfaceContainerHighest,
  },
  sender: {...type.labelCaps, color: colors.onSurfaceVariant},
  bubbleText: {...type.bodyLg},
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.base,
  },
  input: {
    flex: 1,
    ...type.bodyLg,
    color: colors.onSurface,
    maxHeight: 120,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
  },
  sendButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {opacity: 0.35},
  sendPressed: {opacity: 0.85},
  byteCount: {
    ...type.bodySm,
    color: colors.onSurfaceVariant,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.xs,
    backgroundColor: colors.base,
  },
});
