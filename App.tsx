/**
 * VOX — mesh crisis communication for internet shutdowns.
 *
 * "When the infrastructure fails, the people's voice never will."
 */

import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from './src/navigation/RootNavigator';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <RootNavigator />
    </SafeAreaProvider>
  );
}
