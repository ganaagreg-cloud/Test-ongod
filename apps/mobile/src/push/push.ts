import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { api } from '../api';
import { mn } from '../i18n/mn';
import { isExpoGo } from '../lib/expoGo';
import { reportError } from '../monitoring/sentry';
import { deleteItem, getItem, setItem } from '../storage/secureStore';
import { episodeIdOf, nextStep, pushAvailable, type PermissionState } from './rules';

// Push notifications (ADR-0055): this phone's Expo push token goes to PUT /v1/me/push-token.
// Skipped in Expo Go, on the web, on simulators and in builds without an EAS project id.

const OFF_KEY = 'ongod.pushOff';
const CHANNEL_ID = 'default';

const projectId: string | undefined =
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ??
  Constants.easConfig?.projectId;

export const pushIsAvailable = pushAvailable({
  os: Platform.OS,
  isDevice: Device.isDevice,
  isExpoGo,
  projectId,
});

if (pushIsAvailable) {
  // A push that arrives while the app is open shows as a quiet banner.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type PushResult = 'on' | 'off' | 'blocked' | 'unavailable';

async function permission(): Promise<PermissionState> {
  const p = await Notifications.getPermissionsAsync();
  return { granted: p.granted, status: p.status, canAskAgain: p.canAskAgain };
}

/** Sends the current Expo token to the API. Errors (offline, Expo down) wait for the next start. */
async function register(): Promise<void> {
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.setPushToken(data);
}

/**
 * The work behind both triggers: a signed-in start (ask only if the system never asked) and the
 * Профайл switch turned on (ask again when the system allows it).
 */
async function sync(trigger: 'start' | 'switch'): Promise<PushResult> {
  if (!pushIsAvailable) return 'unavailable';
  if (Platform.OS === 'android') {
    // Android 13+ shows the prompt only once a channel exists.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: mn.push.channel,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const optedOut = (await getItem(OFF_KEY)) === '1';
  let step = nextStep(await permission(), { optedOut, trigger });
  if (step === 'ask') {
    await Notifications.requestPermissionsAsync();
    step = nextStep(await permission(), { optedOut, trigger: 'start' });
    if (step === 'ask') step = 'skip'; // still undetermined: the prompt was dismissed
  }
  if (step === 'register') {
    await register();
    return 'on';
  }
  return step === 'blocked' ? 'blocked' : 'off';
}

/** Whether the Профайл switch shows "on" for this phone. */
export async function pushEnabled(): Promise<boolean> {
  if (!pushIsAvailable) return false;
  return (await getItem(OFF_KEY)) !== '1' && (await permission()).granted;
}

/**
 * The Профайл switch. Off: remember it here and clear the token on the server. On: forget the
 * flag, ask or register; `blocked` means the system settings must allow it (opened for them).
 */
export async function setPushEnabled(on: boolean): Promise<PushResult> {
  if (!pushIsAvailable) return 'unavailable';
  if (!on) {
    // Server first: offline, nothing changes and the switch flips back.
    await api.setPushToken(null);
    await setItem(OFF_KEY, '1');
    return 'off';
  }
  await deleteItem(OFF_KEY);
  const result = await sync('switch');
  if (result === 'blocked') await Linking.openSettings();
  return result;
}

/**
 * Mounted once in the signed-in area: registers on start, follows token changes, and opens the
 * Player when a push about one episode is tapped (also when the tap started the app).
 */
export function usePush() {
  const router = useRouter();
  useEffect(() => {
    if (!pushIsAvailable) return;
    void sync('start').catch(reportError);

    const open = (data: unknown) => {
      const id = episodeIdOf(data);
      if (id) router.push({ pathname: '/player/[id]', params: { id } });
    };
    const launched = Notifications.getLastNotificationResponse();
    if (launched) {
      open(launched.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
    }
    const tapped = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response.notification.request.content.data),
    );
    const renewed = Notifications.addPushTokenListener(() => {
      void (async () => {
        if ((await getItem(OFF_KEY)) !== '1') await register();
      })().catch(reportError);
    });
    return () => {
      tapped.remove();
      renewed.remove();
    };
  }, [router]);
}
