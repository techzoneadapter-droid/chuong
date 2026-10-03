import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { requireSupabase } from '../lib/supabase';
import { toServiceError } from './errors';

const DEVICE_KEY_STORAGE = 'chuong:push-device-key:v1';
const TOKEN_STORAGE = 'chuong:expo-push-token:v1';
const CHANNEL_ID = 'chuong-default';

export type PushCapability = {
  supported: boolean;
  projectId: string | null;
  permission: Notifications.PermissionStatus | 'unsupported';
  reason: string;
};

export function getExpoProjectId() {
  const easConfigProjectId = Constants.easConfig?.projectId;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return easConfigProjectId || extra?.eas?.projectId || null;
}

export async function getPushCapability(): Promise<PushCapability> {
  if (Platform.OS === 'web') {
    return {
      supported: false,
      projectId: null,
      permission: 'unsupported',
      reason: 'Push chỉ hoạt động trên build Android/iOS.',
    };
  }

  const projectId = getExpoProjectId();
  let permission: Notifications.PermissionStatus = Notifications.PermissionStatus.UNDETERMINED;
  try {
    permission = (await Notifications.getPermissionsAsync()).status;
  } catch {
    // Keep undetermined when the native module is unavailable in a preview client.
  }

  if (!projectId) {
    return {
      supported: false,
      projectId: null,
      permission,
      reason: 'Chưa có EAS projectId. Cần tạo development/release build trước khi bật push.',
    };
  }

  return {
    supported: true,
    projectId,
    permission,
    reason: permission === Notifications.PermissionStatus.DENIED
      ? 'Quyền thông báo đang bị tắt trong cài đặt hệ thống.'
      : 'Thiết bị có thể đăng ký nhận push.',
  };
}

async function getOrCreateDeviceKey() {
  const current = await AsyncStorage.getItem(DEVICE_KEY_STORAGE);
  if (current) return current;
  const next = [
    Platform.OS,
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join(':');
  await AsyncStorage.setItem(DEVICE_KEY_STORAGE, next);
  return next;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'CHƯƠNG',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#8F1D3F',
    sound: 'default',
  });
}

export async function registerCurrentDeviceForPush(options?: { requestPermission?: boolean }) {
  if (Platform.OS === 'web') {
    throw new Error('Push chỉ hỗ trợ Android/iOS.');
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error('Chưa có EAS projectId cho build Android/iOS.');
  }

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== Notifications.PermissionStatus.GRANTED && options?.requestPermission) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== Notifications.PermissionStatus.GRANTED) {
    throw new Error('Bạn chưa cấp quyền nhận thông báo trên thiết bị.');
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    throw toServiceError(error, 'Không thể lấy Expo Push Token. Hãy thử lại khi thiết bị có mạng.');
  }

  const deviceKey = await getOrCreateDeviceKey();
  const appVersion = Constants.expoConfig?.version || null;
  const label = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || null;

  const { data, error } = await requireSupabase().rpc('register_push_device', {
    p_device_key: deviceKey,
    p_expo_push_token: token,
    p_platform: Platform.OS,
    p_project_id: projectId,
    p_app_version: appVersion || '',
    p_device_label: label || '',
  });
  if (error) throw toServiceError(error, 'Không thể đăng ký thiết bị nhận thông báo.');

  await AsyncStorage.setItem(TOKEN_STORAGE, token);
  return { token, deviceKey, row: data };
}

export async function syncCurrentPushDeviceIfPermitted() {
  if (Platform.OS === 'web') return null;
  const capability = await getPushCapability();
  if (!capability.supported || capability.permission !== Notifications.PermissionStatus.GRANTED) return null;
  return registerCurrentDeviceForPush({ requestPermission: false });
}

export async function unregisterCurrentPushDevice() {
  if (Platform.OS === 'web') return false;
  const deviceKey = await AsyncStorage.getItem(DEVICE_KEY_STORAGE);
  if (!deviceKey) return false;

  try {
    const { data, error } = await requireSupabase().rpc('unregister_push_device', {
      p_device_key: deviceKey,
    });
    if (error) throw error;
    await AsyncStorage.removeItem(TOKEN_STORAGE);
    return Boolean(data);
  } catch (error) {
    throw toServiceError(error, 'Không thể tắt push trên thiết bị này.');
  }
}

export async function getRegisteredPushDevices() {
  if (Platform.OS === 'web') return [];
  const { data, error } = await requireSupabase()
    .from('push_devices')
    .select('*')
    .eq('enabled', true)
    .order('last_seen_at', { ascending: false });
  if (error) throw toServiceError(error, 'Không thể tải danh sách thiết bị nhận push.');
  return data ?? [];
}

export function configureForegroundNotificationHandler() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function addPushResponseListener(listener: (actionRoute: string | null) => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const value = response.notification.request.content.data?.actionRoute;
    listener(typeof value === 'string' ? value : null);
  });
}

export function addPushTokenRefreshListener(listener: () => void) {
  if (Platform.OS === 'web') return { remove: () => undefined };
  return Notifications.addPushTokenListener(() => listener());
}

export async function getInitialPushActionRoute() {
  if (Platform.OS === 'web') return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  const value = response?.notification.request.content.data?.actionRoute;
  return typeof value === 'string' ? value : null;
}
