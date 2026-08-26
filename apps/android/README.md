# Android app (Kotlin / Compose)

Native client with the **same wire protocol and features** as `apps/web`: auth, snapshot/patch, timeline, action chips (Skip / Always Run / Run / answers), freeform Other, chat tabs, send message, attention notifications.

Unlike the browser UI (same-origin to the bridge), the app asks for the **bridge host** (`<tailscale-ip>:8787` or MagicDNS).

## Build

From `apps/android` (JDK 17+, Android SDK):

```powershell
cd apps\android
.\gradlew.bat assembleDebug
```

APK: `app/build/outputs/apk/debug/app-debug.apk`

Install on a device:

```powershell
.\gradlew.bat installDebug
```

Open Android Studio on `apps/android` if you prefer.

## Use

1. Phone and PC on the same Tailscale network; bridge running.
2. Open the app, enter host (`100.x.x.x:8787`) and `BRIDGE_AUTH_TOKEN`.
3. Tap **Enter**. Focus the desired chat in Cursor Agents Window.

Cleartext `ws://` is allowed because Tailscale already encrypts the overlay. Use `wss://` if you terminate TLS (e.g. Tailscale Serve).
