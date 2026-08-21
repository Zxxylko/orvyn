import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

const ANDROID_CHANNEL_ID = 'orvyn-reminders';
const PUSH_TOKEN_KEY = '@orvyn/expo-push-token/v1';

export type PushRegistrationStatus =
  | 'registered'
  | 'denied'
  | 'unsupported'
  | 'unavailable';

export interface PushRegistrationResult {
  status: PushRegistrationStatus;
  token?: string;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerCurrentDeviceForPush(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return { status: 'unsupported' };
  }

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Pengingat ORVYN',
        description: 'Deadline, agenda, kebiasaan, dan ringkasan harian ORVYN.',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 180, 250],
        lightColor: '#22D3EE',
        sound: 'default',
      });
    }

    const currentPermission = await Notifications.getPermissionsAsync();
    if (
      !currentPermission.granted
      && (
        !currentPermission.canAskAgain
        || currentPermission.status !== Notifications.PermissionStatus.UNDETERMINED
      )
    ) {
      return { status: 'denied' };
    }

    const permission = currentPermission.granted
      ? currentPermission
      : await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });

    if (!permission.granted) return { status: 'denied' };

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId
      ?? Constants.easConfig?.projectId;
    if (typeof projectId !== 'string' || !projectId.trim()) {
      return { status: 'unavailable' };
    }

    const token = (
      await Notifications.getExpoPushTokenAsync({ projectId })
    ).data;

    await api.post('/push-tokens', {
      token,
      platform: Platform.OS,
      device_name:
        Device.deviceName
        ?? Device.modelName
        ?? `${Platform.OS === 'ios' ? 'iOS' : 'Android'} device`,
      app_version: Constants.expoConfig?.version ?? '1.0.0',
    });

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return { status: 'registered', token };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function unregisterCurrentDevicePushBestEffort(): Promise<void> {
  let token: string | null = null;

  try {
    token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await api.delete('/push-tokens/current', { data: { token } });
    }
  } catch {
    // Logout must continue if the server or notification service is offline.
  } finally {
    try {
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    } catch {
      // Best-effort cleanup only.
    }
  }
}
