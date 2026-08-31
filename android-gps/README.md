# Sightseeing Shkodra GPS sender

Native Android sender for the bus Pixel. It records a high-accuracy location approximately every five seconds, stores reports in a local SQLite queue, uploads them in order, and keeps working with the screen off through a foreground service.

The production filter rejects mock, stale, weak (worse than 50 m), out-of-order, and physically impossible fixes. Stationary reports are reduced to a 15-second heartbeat. Moving fixes prioritize the newest queued position and remove superseded older positions after successful delivery, preventing offline backlog from delaying the live marker. The status screen reports satellites used/visible, detected GNSS carrier bands, available compass/gyro/rotation/accelerometer sensors, rejected fixes, stale GPS, connectivity, and queued uploads. Android chooses the actual satellite constellations and bands; the app observes and reports them rather than attempting to force radio hardware modes.

## 1. Install the tools

Install the current stable Android Studio from <https://developer.android.com/studio>. During setup, install:

- Android SDK Platform 36
- Android SDK Build Tools 36
- Android SDK Platform Tools

The project includes the official Gradle 8.13 wrapper and Android Studio uses its bundled JDK for syncing and building.

## 2. Deploy the backend

Run the SQL in `../supabase/migrations/202608260001_gps_ingestion.sql` using the Supabase SQL editor or CLI.

Generate a device token. In PowerShell:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLowerInvariant()
```

Copy the generated value and configure it as an Edge Function secret:

```powershell
supabase secrets set GPS_DEVICE_TOKEN=THE_GENERATED_VALUE
supabase functions deploy gps-ingest --no-verify-jwt
```

Do not use the Supabase publishable, secret, or service-role key as the device token.

## 3. Configure the Android build

Copy `local.properties.example` to `local.properties`. Keep the `sdk.dir` written by Android Studio and set:

```properties
gps.endpoint=https://jpcjdqwyrrcusuvypwic.supabase.co/functions/v1/gps-ingest
gps.deviceToken=THE_SAME_GENERATED_VALUE
gps.vehicleId=sightseeing-shkodra-van-1
```

`local.properties` is ignored by Git. The device token is deliberately limited to this ingestion endpoint, but it is still recoverable from an installed APK. Rotate it if the phone or APK is compromised.

## 4. Build and install

1. Open the `android-gps` directory in Android Studio.
2. Allow Gradle Sync to finish.
3. Connect the Pixel by USB and enable Developer options → USB debugging.
4. Select the Pixel and click **Run** for a development installation.
5. For a distributable APK, use **Build → Generate Signed App Bundle or APK → APK** and create a private signing key.

On Windows, generated output is kept outside OneDrive at `%LOCALAPPDATA%/SightseeingShkodraGps/build/app`. The debug APK is written to its `outputs/apk/debug/app-debug.apk` directory.

## 5. Configure the Pixel

1. Open **Shkodra Bus GPS**.
2. Grant precise location and notifications.
3. Open app settings → Permissions → Location → **Allow all the time**.
4. Open app settings → App battery usage → select **Unrestricted**.
5. Disable Battery Saver during bus service.
6. Press **Start tracking** and keep the persistent GPS notification enabled.
7. Reboot once and verify that tracking resumes.

Use a permanent vehicle charger and mount the phone where it has a clear sky view. Press **Stop tracking** when the vehicle is out of service.

## Payload

The app sends `vehicle_id`, coordinates, accuracy, speed, bearing, altitude, GPS timestamp, battery percentage, source, mock-location status, and a unique event ID. Failed uploads stay in the private app database and retry every 30 seconds.
