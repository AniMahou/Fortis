import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import React from 'react';
import {MisinformationScreen} from '../screens/mocked/MisinformationScreen';
import {MediaArchiveScreen} from '../screens/mocked/MediaArchiveScreen';
import {SettingsScreen} from '../screens/mocked/SettingsScreen';
import {MeshRelayScreen} from '../screens/real/MeshRelayScreen';
import {ReportDangerScreen} from '../screens/real/ReportDangerScreen';
import {SosConfirmationScreen} from '../screens/real/SosConfirmationScreen';
import {WipeCompleteScreen} from '../screens/real/WipeCompleteScreen';
import {PermissionsScreen} from '../screens/real/onboarding/PermissionsScreen';
import {PrivacyWarningScreen} from '../screens/real/onboarding/PrivacyWarningScreen';
import {SetNicknameScreen} from '../screens/real/onboarding/SetNicknameScreen';
import {SetPinScreen} from '../screens/real/onboarding/SetPinScreen';
import {SetupCompleteScreen} from '../screens/real/onboarding/SetupCompleteScreen';
import {SplashScreen} from '../screens/real/onboarding/SplashScreen';
import {WelcomeScreen} from '../screens/real/onboarding/WelcomeScreen';
import {MainTabs} from './MainTabs';
import type {RootStackParamList} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{headerShown: false}}>
        {/* Onboarding — all real, see CONTEXT.md section 5. */}
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="PrivacyWarning" component={PrivacyWarningScreen} />
        <Stack.Screen name="SetNickname" component={SetNicknameScreen} />
        <Stack.Screen name="SetPin" component={SetPinScreen} />
        <Stack.Screen name="Permissions" component={PermissionsScreen} />
        <Stack.Screen name="SetupComplete" component={SetupCompleteScreen} />

        <Stack.Screen name="Main" component={MainTabs} />

        {/* Real features reached from the tabs. */}
        <Stack.Screen name="MeshRelay" component={MeshRelayScreen} />
        <Stack.Screen
          name="SosConfirmation"
          component={SosConfirmationScreen}
        />
        <Stack.Screen
          name="ReportDanger"
          component={ReportDangerScreen}
          options={{presentation: 'modal'}}
        />
        <Stack.Screen name="WipeComplete" component={WipeCompleteScreen} />

        {/* Mocked — every one renders a DEMO banner. */}
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="MediaArchive" component={MediaArchiveScreen} />
        <Stack.Screen name="Misinformation" component={MisinformationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
