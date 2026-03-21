import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { fetcher } from "./api";

const isNative = Platform.OS === "ios" || Platform.OS === "android";

const ANDROID_CHANNEL_ID = "default";

if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function routeFromPushData(
  data: Record<string, unknown> | undefined | null,
): string | null {
  if (!data || typeof data !== "object") return null;
  const url = data.url;
  if (typeof url === "string" && url.startsWith("/")) return url;
  if (typeof data.username === "string") {
    return `/user/${encodeURIComponent(data.username)}`;
  }
  if (typeof data.album_id === "string") return `/album/${data.album_id}`;
  if (typeof data.song_id === "string") return `/song/${data.song_id}`;
  if (typeof data.list_id === "string") return `/list/${data.list_id}`;
  return null;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (!projectId) {
    if (__DEV__) {
      console.warn(
        "[push] No EAS projectId in app config — skipping Expo push token (set extra.eas.projectId).",
      );
    }
    return null;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  return tokenResponse.data ?? null;
}

export async function sendExpoPushTokenToBackend(token: string | null): Promise<void> {
  if (!isNative) return;
  await fetcher<{ ok: boolean }>("/api/users/me/push-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expo_push_token: token }),
  });
}

export async function registerPushWithBackend(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      await sendExpoPushTokenToBackend(token);
    }
  } catch (e) {
    console.warn("[push] registerPushWithBackend:", e);
  }
}

export { Notifications, ANDROID_CHANNEL_ID };
