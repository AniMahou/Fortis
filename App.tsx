/**
 * Placeholder root. Replaced by the navigation container once the screens
 * exist — see src/navigation/.
 */

import React from 'react';
import {SafeAreaView, StatusBar, StyleSheet, Text, View} from 'react-native';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.center}>
        <Text style={styles.wordmark}>VOX</Text>
        <Text style={styles.tagline}>
          When the infrastructure fails, the people's voice never will.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#FFFFFF'},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  wordmark: {
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#1A1A1A',
  },
  tagline: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: '#6B6B6B',
  },
});
