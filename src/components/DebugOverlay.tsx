/**
 * Mesh diagnostics, behind a long-press on the wordmark.
 *
 * Two jobs. During the BLE spike (docs/BLE_SPIKE.md) it is the only way to see
 * what the radio actually reported — whether this handset can advertise at
 * all, whether extended advertising is available, how many usable bytes per
 * frame. During the demo it is evidence: the drop counters show packets being
 * validated and rejected, which is hard to argue with and impossible to fake
 * convincingly.
 */

import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {getServices} from '../app/services';
import {config} from '../config/env';
import {BleTransport} from '../mesh/bleTransport';
import {WifiTransport} from '../mesh/wifiTransport';
import {useMeshStore} from '../state/meshStore';
import {Button} from './primitives';
import {colors, radius, spacing, type} from '../theme/tokens';

export function DebugOverlay({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const stats = useMeshStore(state => state.stats);
  const status = useMeshStore(state => state.status);
  const peers = useMeshStore(state => state.peers);

  const rows: Array<[string, string]> = [
    ['transport', config.transport],
    ['state', status.state],
    ['ready', String(status.ready)],
    ['detail', status.detail ?? '—'],
    ['frameBytes', status.maxFrameBytes?.toString() ?? '—'],
    ['peers', String(peers.length)],
    ['maxTtl', String(config.meshMaxTtl)],
  ];

  if (stats) {
    rows.push(
      ['sent', String(stats.sent)],
      ['received', String(stats.received)],
      ['relayed', String(stats.relayed)],
      ['dropped.duplicate', String(stats.dropped.duplicate)],
      ['dropped.own', String(stats.dropped.own)],
      ['dropped.malformed', String(stats.dropped.malformed)],
      ['dropped.bad_signature', String(stats.dropped.bad_signature)],
    );
  }

  const diagnostics = readTransportDiagnostics();
  for (const [key, value] of Object.entries(diagnostics)) {
    rows.push([key, value]);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Mesh diagnostics</Text>
          <ScrollView style={styles.list}>
            {rows.map(([key, value]) => (
              <View key={key} style={styles.row}>
                <Text style={styles.key}>{key}</Text>
                <Text style={styles.value} numberOfLines={2}>
                  {value}
                </Text>
              </View>
            ))}
          </ScrollView>
          <Button label="Close" variant="secondary" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Reads whatever the active transport exposes. Written defensively because
 * this runs during a spike, when the transport may well be in a broken state —
 * a diagnostics panel that crashes is worse than no panel at all.
 */
function readTransportDiagnostics(): Record<string, string> {
  const services = getServices();
  if (!services) return {};
  const active = services.mesh.activeTransport;

  try {
    // Only the BLE and WiFi transports publish diagnostics; loopback has
    // nothing interesting to say.
    if (!(active instanceof BleTransport || active instanceof WifiTransport)) {
      return {};
    }
    const diagnostics: Record<string, unknown> = active.diagnostics;
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(diagnostics)) {
      flat[key] =
        value && typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
    }
    return flat;
  } catch {
    return {};
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.base,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: '80%',
  },
  title: {...type.headlineMd, color: colors.onSurface},
  list: {maxHeight: 420},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    gap: spacing.md,
  },
  key: {...type.bodySm, color: colors.onSurfaceVariant, fontFamily: 'monospace'},
  value: {
    ...type.bodySm,
    color: colors.onSurface,
    fontFamily: 'monospace',
    flexShrink: 1,
    textAlign: 'right',
  },
});
