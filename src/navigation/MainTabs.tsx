/**
 * The four-item bottom bar from the design: Chat, Feed, Map, Safety.
 *
 * Feed is the dashboard, which matches the Stitch export — `dashboard_home`
 * shows Feed as the active tab. The Safety icon carries a red dot when an SOS
 * has been heard and not yet looked at, which is the one place outside an
 * emergency action where the emergency colour is allowed.
 */

import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon, type IconName} from '../components/Icon';
import {ChatListScreen} from '../screens/mocked/ChatListScreen';
import {PublicFeedScreen} from '../screens/mocked/PublicFeedScreen';
import {DashboardScreen} from '../screens/real/DashboardScreen';
import {SafetyCenterScreen} from '../screens/real/SafetyCenterScreen';
import {SafetyMapScreen} from '../screens/real/SafetyMapScreen';
import {useMeshStore} from '../state/meshStore';
import type {MainTabParamList} from './types';
import {colors, spacing, type} from '../theme/tokens';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({
  name,
  focused,
  alert = false,
}: {
  name: IconName;
  focused: boolean;
  alert?: boolean;
}): React.JSX.Element {
  return (
    <View>
      <Icon
        name={name}
        size={24}
        color={focused ? colors.primary : colors.secondary}
      />
      {alert && <View style={styles.dot} />}
    </View>
  );
}

function TabLabel({
  label,
  focused,
}: {
  label: string;
  focused: boolean;
}): React.JSX.Element {
  return (
    <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
  );
}

export function MainTabs(): React.JSX.Element {
  const unreadAlerts = useMeshStore(state => state.unreadAlerts);
  const markAlertsRead = useMeshStore(state => state.markAlertsRead);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
      }}>
      <Tab.Screen
        name="Chat"
        component={ChatListScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon name="chat" focused={focused} />,
          tabBarLabel: ({focused}) => (
            <TabLabel label="Chat" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Feed"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon name="feed" focused={focused} />,
          tabBarLabel: ({focused}) => (
            <TabLabel label="Feed" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Map"
        component={SafetyMapScreen}
        options={{
          tabBarIcon: ({focused}) => <TabIcon name="map" focused={focused} />,
          tabBarLabel: ({focused}) => <TabLabel label="Map" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Safety"
        component={SafetyCenterScreen}
        listeners={{focus: () => markAlertsRead()}}
        options={{
          tabBarIcon: ({focused}) => (
            <TabIcon name="shield" focused={focused} alert={unreadAlerts > 0} />
          ),
          tabBarLabel: ({focused}) => (
            <TabLabel label="Safety" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/** Exported so the stack can route to the mocked feed from elsewhere. */
export {PublicFeedScreen};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.base,
    borderTopColor: colors.outlineVariant,
    borderTopWidth: 1,
    height: 64,
    paddingTop: spacing.xs,
  },
  item: {paddingVertical: spacing.xs},
  label: {...type.labelCaps, fontSize: 10, color: colors.secondary},
  labelActive: {color: colors.primary},
  dot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.emergency,
  },
});
