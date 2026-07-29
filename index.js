/**
 * @format
 */

// MUST be the first import in the app.
//
// tweetnacl generates the device keypair with crypto.getRandomValues, which
// React Native does not provide — without this polyfill nacl.sign.keyPair()
// throws "no PRNG" the first time the splash screen tries to create an
// identity, and the app never gets past launch. It is imported here rather
// than inside crypto/keys.ts so that module stays free of React Native
// imports and testable in plain Node.
import 'react-native-get-random-values';

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
