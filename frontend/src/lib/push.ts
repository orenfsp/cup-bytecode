// Подписка на Web Push уведомления без привязки к личности (ключ — обращение).
import { api } from "./api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Возвращает true при успешной подписке.
export async function enablePush(track: string): Promise<boolean> {
  if (!pushSupported()) throw new Error("Уведомления не поддерживаются этим браузером");

  const vapid = await api.get("/api/push/vapid-public");
  if (!vapid.enabled || !vapid.key) throw new Error("Push отключён на сервере");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Уведомления не разрешены");

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid.key),
  });

  const json: any = sub.toJSON();
  await api.post("/api/push/subscribe", {
    track,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
  return true;
}
