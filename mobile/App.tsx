import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LoadingView } from './src/components/LoadingView';
import { NetworkStatusBanner } from './src/components/NetworkStatus';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { NetworkProvider } from './src/contexts/NetworkContext';
import { AccountScreen } from './src/screens/AccountScreen';
import { AcademicScreen } from './src/screens/AcademicScreen';
import { BriefingScreen } from './src/screens/BriefingScreen';
import { CampusScreen } from './src/screens/CampusScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { FinanceScreen } from './src/screens/FinanceScreen';
import { FocusScreen } from './src/screens/FocusScreen';
import { HabitsScreen } from './src/screens/HabitsScreen';
import { HealthScreen } from './src/screens/HealthScreen';
import { HubScreen } from './src/screens/HubScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { PushNotificationSettingsScreen } from './src/screens/PushNotificationSettingsScreen';
import { ScheduleScreen } from './src/screens/ScheduleScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { WhatsAppSettingsScreen } from './src/screens/WhatsAppSettingsScreen';
import { colors } from './src/theme';
import type { HubStackParamList, RootTabParamList, ScheduleStackParamList } from './src/types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const ScheduleStack = createNativeStackNavigator<ScheduleStackParamList>();
const HubStack = createNativeStackNavigator<HubStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.cyan,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    text: colors.text,
    notification: colors.rose,
  },
};

const tabIcons: Record<keyof RootTabParamList, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Beranda: { active: 'grid', inactive: 'grid-outline' },
  Tugas: { active: 'checkmark-circle', inactive: 'checkmark-circle-outline' },
  Jadwal: { active: 'calendar', inactive: 'calendar-outline' },
  Hub: { active: 'apps', inactive: 'apps-outline' },
  Akun: { active: 'person-circle', inactive: 'person-circle-outline' },
};

const childScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textSecondary,
  headerTitle: '',
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
  contentStyle: { backgroundColor: colors.background },
};

function ScheduleNavigator() {
  return (
    <ScheduleStack.Navigator screenOptions={childScreenOptions}>
      <ScheduleStack.Screen name="Agenda" component={ScheduleScreen} options={{ headerShown: false }} />
      <ScheduleStack.Screen name="Focus" component={FocusScreen} />
    </ScheduleStack.Navigator>
  );
}

function HubNavigator() {
  return (
    <HubStack.Navigator screenOptions={childScreenOptions}>
      <HubStack.Screen name="HubHome" component={HubScreen} options={{ headerShown: false }} />
      <HubStack.Screen name="Briefing" component={BriefingScreen} />
      <HubStack.Screen name="Academic" component={AcademicScreen} />
      <HubStack.Screen name="Campus" component={CampusScreen} />
      <HubStack.Screen name="Finance" component={FinanceScreen} />
      <HubStack.Screen name="Health" component={HealthScreen} />
      <HubStack.Screen name="Habits" component={HabitsScreen} />
      <HubStack.Screen name="PushNotifications" component={PushNotificationSettingsScreen} />
      <HubStack.Screen name="WhatsApp" component={WhatsAppSettingsScreen} />
    </HubStack.Navigator>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingView />;
  if (!user) return <LoginScreen />;

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.cyan,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: styles.tabLabel,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabItem,
          tabBarIcon: ({ color, focused, size }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name={focused ? tabIcons[route.name].active : tabIcons[route.name].inactive} size={focused ? size + 1 : size} color={color} />
            </View>
          ),
        })}
      >
        <Tab.Screen name="Beranda" component={DashboardScreen} />
        <Tab.Screen name="Tugas" component={TasksScreen} />
        <Tab.Screen name="Jadwal" component={ScheduleNavigator} />
        <Tab.Screen name="Hub" component={HubNavigator} />
        <Tab.Screen name="Akun" component={AccountScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NetworkProvider>
        <AuthProvider>
          <View style={styles.appShell}>
            <StatusBar style="light" />
            <AppContent />
            <NetworkStatusBanner />
          </View>
        </AuthProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    height: 74,
    paddingTop: 8,
    paddingBottom: 9,
    borderTopWidth: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    elevation: 14,
  },
  tabItem: {
    borderRadius: 16,
  },
  tabLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  iconWrap: {
    width: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
  },
});
