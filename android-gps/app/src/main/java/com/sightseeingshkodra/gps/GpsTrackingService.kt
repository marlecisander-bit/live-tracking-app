package com.sightseeingshkodra.gps

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.location.GnssStatus
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.PowerManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min
import kotlin.random.Random

class GpsTrackingService : Service() {
    private lateinit var locationClient: FusedLocationProviderClient
    private lateinit var locationManager: LocationManager
    private lateinit var connectivityManager: ConnectivityManager
    private lateinit var queue: GpsQueue
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private val qualityFilter = LocationQualityFilter()
    private val motionDetector = MotionStateDetector()
    private val uploadInFlight = AtomicBoolean(false)
    @Volatile private var gnssSnapshot = GnssSnapshot()
    private val fixTimes = ArrayDeque<Long>()
    private var serviceStartedElapsed = 0L
    private var firstFixElapsed = 0L
    private var lastAcceptedLocation: Location? = null
    private var lastStationaryUploadElapsed = 0L
    private var acceptedFixCount = 0L
    @Volatile private var nextUploadAllowedElapsed = 0L
    @Volatile private var uploadBackoffMs = 2_000L

    private val uploadRetry = object : Runnable {
        override fun run() {
            uploadQueue()
            handler.postDelayed(this, UPLOAD_RETRY_MS)
        }
    }

    private val healthCheck = object : Runnable {
        override fun run() {
            val lastFix = TrackerState.lastFixElapsed(this@GpsTrackingService)
            val ageSeconds = if (lastFix > 0) (SystemClock.elapsedRealtime() - lastFix) / 1000 else Long.MAX_VALUE
            val health = DeviceHealthReader.read(this@GpsTrackingService)
            TrackerState.setPowerStatus(
                this@GpsTrackingService,
                "${if (health.charging) "VEHICLE POWER" else "BATTERY POWER"} | ${health.batteryPercent}% | " +
                    "${health.batteryTemperatureC?.let { "${"%.1f".format(it)} C" } ?: "temp unknown"} | thermal ${health.thermalLabel}",
            )
            if (health.thermalStatus >= PowerManager.THERMAL_STATUS_SEVERE) {
                TrackerState.setLastStatus(this@GpsTrackingService, "DEGRADED | thermal ${health.thermalLabel}")
                updateNotification("Thermal warning: ${health.thermalLabel}")
            } else if (ageSeconds > GPS_STALE_SECONDS) {
                val message = if (lastFix == 0L) "Searching for satellites" else "GPS signal lost: ${ageSeconds}s"
                TrackerState.setLastStatus(this@GpsTrackingService, "DEGRADED | $message")
                updateNotification(message)
            }
            handler.postDelayed(this, HEALTH_CHECK_MS)
        }
    }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach(::recordLocation)
        }
    }

    private val gnssCallback = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) {
            gnssSnapshot = GnssDiagnostics.from(status)
            TrackerState.setDiagnostics(this@GpsTrackingService, gnssSnapshot.display() + " | " + sensorSummary())
        }

        override fun onStarted() {
            TrackerState.setDiagnostics(this@GpsTrackingService, "GNSS started | ${sensorSummary()}")
        }

        override fun onStopped() {
            TrackerState.setDiagnostics(this@GpsTrackingService, "GNSS stopped | ${sensorSummary()}")
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            nextUploadAllowedElapsed = 0L
            uploadQueue()
        }

        override fun onLost(network: Network) {
            TrackerState.setLastStatus(this@GpsTrackingService, "OFFLINE | ${queue.count()} queued")
        }
    }

    override fun onCreate() {
        super.onCreate()
        locationClient = LocationServices.getFusedLocationProviderClient(this)
        locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        connectivityManager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        queue = GpsQueue(this)
        createNotificationChannel()
        TrackerState.setDiagnostics(this, "Waiting for GNSS | ${sensorSummary()}")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopTracking()
            return START_NOT_STICKY
        }
        if (!configurationIsValid()) {
            TrackerState.setLastStatus(this, "Configuration missing")
            stopSelf()
            return START_NOT_STICKY
        }

        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification("Starting GPS..."),
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
        )
        TrackerState.setTracking(this, true)
        TrackerState.setResumePending(this, false)
        TrackerState.setLastFixElapsed(this, 0L)
        serviceStartedElapsed = SystemClock.elapsedRealtime()
        firstFixElapsed = 0L
        TrackerState.setLastStatus(this, "Searching for satellites")
        requestLocations()
        registerNetworkCallback()
        handler.removeCallbacks(uploadRetry)
        handler.post(uploadRetry)
        handler.removeCallbacks(healthCheck)
        handler.post(healthCheck)
        return START_STICKY
    }

    private fun configurationIsValid(): Boolean =
        BuildConfig.GPS_ENDPOINT.startsWith("https://") && BuildConfig.GPS_DEVICE_TOKEN.length >= 32

    private fun requestLocations() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopTracking()
            return
        }
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_INTERVAL_MS)
            .setMinUpdateIntervalMillis(MIN_LOCATION_INTERVAL_MS)
            .setMinUpdateDistanceMeters(0f)
            .setWaitForAccurateLocation(false)
            .build()
        locationClient.removeLocationUpdates(locationCallback)
        locationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        locationManager.unregisterGnssStatusCallback(gnssCallback)
        locationManager.registerGnssStatusCallback(gnssCallback, handler)
    }

    private fun recordLocation(location: Location) {
        try {
            if (location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0) return
            val nowElapsed = SystemClock.elapsedRealtime()
            TrackerState.setLastFixElapsed(this, nowElapsed)
            fixTimes.addLast(nowElapsed)
            while (fixTimes.size > 20) fixTimes.removeFirst()
            if (firstFixElapsed == 0L) firstFixElapsed = nowElapsed

            val decision = qualityFilter.evaluate(location)
            if (!decision.accepted) {
                TrackerState.setLastRejection(this, decision.reason)
                TrackerState.setLastStatus(this, "DEGRADED | ${decision.reason}")
                updateNotification(decision.reason)
                return
            }

            val quality = LocationQualityEvaluator.evaluate(location)
            val motion = motionDetector.update(location)
            if (
                acceptedFixCount > 0 && motion == MotionState.STATIONARY &&
                nowElapsed - lastStationaryUploadElapsed < STATIONARY_HEARTBEAT_MS
            ) {
                TrackerState.setLastRejection(this, "Stationary heartbeat suppressed (${quality.state})")
                return
            }
            if (motion == MotionState.STATIONARY) lastStationaryUploadElapsed = nowElapsed

            val previous = lastAcceptedLocation
            val derivedCourse = previous?.takeIf { it.distanceTo(location) >= 5f }?.bearingTo(location)
                ?.let { if (it < 0) it + 360f else it }
            val headingSource = when {
                location.hasBearing() && (!location.hasSpeed() || location.speed >= 1.5f) -> "GNSS_BEARING"
                derivedCourse != null -> "DERIVED_COURSE"
                else -> "UNKNOWN"
            }
            val eventId = UUID.randomUUID().toString()
            val sequence = TrackerState.nextSequence(this)
            val health = DeviceHealthReader.read(this)
            val speedKmh = if (location.hasSpeed()) location.speed * 3.6 else JSONObject.NULL
            val bearing = if (location.hasBearing()) location.bearing else JSONObject.NULL
            val altitude = if (location.hasAltitude()) location.altitude else JSONObject.NULL
            val verticalAccuracy = if (location.hasVerticalAccuracy()) location.verticalAccuracyMeters else JSONObject.NULL
            val isMock = if (android.os.Build.VERSION.SDK_INT >= 31) location.isMock else location.isFromMockProvider

            val payload = JSONObject()
            .put("event_id", eventId)
            .put("sequence", sequence)
            .put("device_id", BuildConfig.GPS_DEVICE_ID)
            .put("vehicle_id", BuildConfig.GPS_VEHICLE_ID)
            .put("latitude", location.latitude)
            .put("longitude", location.longitude)
            .put("accuracy_m", location.accuracy)
            .put("vertical_accuracy_m", verticalAccuracy)
            .put("speed_kmh", speedKmh)
            .put("speed_accuracy_mps", location.speedAccuracyMpsOrNull() ?: JSONObject.NULL)
            .put("bearing_deg", bearing)
            .put("bearing_accuracy_deg", location.bearingAccuracyDegOrNull() ?: JSONObject.NULL)
            .put("derived_course_deg", derivedCourse ?: JSONObject.NULL)
            .put("heading_source", headingSource)
            .put("altitude_m", altitude)
            .put("elapsed_realtime_nanos", location.elapsedRealtimeNanos)
            .put("source_recorded_at", Instant.ofEpochMilli(location.time).toString())
            .put("quality_state", quality.state.name)
            .put("motion_state", motion.name)
            .put("battery_percent", health.batteryPercent)
            .put("external_power", health.charging)
            .put("battery_temperature_c", health.batteryTemperatureC ?: JSONObject.NULL)
            .put("thermal_status", health.thermalLabel)
            .put("provider", location.provider ?: "fused")
            .put("satellites_visible", gnssSnapshot.visible)
            .put("satellites_used", gnssSnapshot.used)
            .put("constellations", gnssSnapshot.constellations)
            .put("frequency_bands", gnssSnapshot.frequencyBands)
            .put("cn0_median_dbhz", gnssSnapshot.cn0MedianDbHz ?: JSONObject.NULL)
            .put("fix_rate_hz", fixRateHz())
            .put("ttff_ms", firstFixElapsed - serviceStartedElapsed)
            .put("is_mock", isMock)
            .put("source", "pixel-android")
            .toString()

            queue.enqueue(eventId, sequence, payload)
            acceptedFixCount += 1
            lastAcceptedLocation = Location(location)
            TrackerState.setLastFix(
            this,
            "%.6f, %.6f | +/-%.0f m | age %.1fs | %.1f km/h | %s | %s".format(
                location.latitude,
                location.longitude,
                location.accuracy,
                quality.ageSeconds,
                if (location.hasSpeed()) location.speed * 3.6 else 0.0,
                quality.state,
                motion,
            ),
        )
            val agentState = agentState(quality.state, health)
            TrackerState.setLastStatus(this, "$agentState | ${quality.state} | $motion | ${queue.count()} queued")
            TrackerState.setPowerStatus(
                this,
                "${if (health.charging) "VEHICLE POWER" else "BATTERY POWER"} | ${health.batteryPercent}% | " +
                    "${health.batteryTemperatureC?.let { "${"%.1f".format(it)} C" } ?: "temp unknown"} | thermal ${health.thermalLabel}",
            )
            updateNotification("$agentState | ${quality.state} | age ${"%.1f".format(quality.ageSeconds)}s | ${queue.count()} queued")
            uploadQueue()
        } catch (error: Exception) {
            TrackerState.setLastRejection(this, "Location callback error: ${error.javaClass.simpleName}")
            TrackerState.setLastStatus(this, "ERROR | location processing")
        }
    }

    private fun fixRateHz(): Double {
        if (fixTimes.size < 2) return 0.0
        val seconds = (fixTimes.last() - fixTimes.first()) / 1000.0
        return if (seconds > 0) (fixTimes.size - 1) / seconds else 0.0
    }

    private fun agentState(quality: LocationQuality, health: DeviceHealth): String = when {
        !isNetworkAvailable() -> "OFFLINE"
        health.thermalStatus >= PowerManager.THERMAL_STATUS_SEVERE -> "DEGRADED"
        quality == LocationQuality.POOR || quality == LocationQuality.STALE -> "DEGRADED"
        queue.count() > QUEUE_WARNING_COUNT -> "DEGRADED"
        else -> "READY"
    }

    private fun sensorSummary(): String {
        val manager = getSystemService(SENSOR_SERVICE) as SensorManager
        val sensors = mutableListOf<String>()
        if (manager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null) sensors += "gyro"
        if (manager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null) sensors += "compass"
        if (manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null) sensors += "rotation"
        if (manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null) sensors += "accelerometer"
        return "sensors: ${sensors.joinToString("+").ifEmpty { "unavailable" }}"
    }

    private fun uploadQueue() {
        if (!isNetworkAvailable()) {
            TrackerState.setLastStatus(this, "OFFLINE | ${queue.count()} queued")
            return
        }
        if (SystemClock.elapsedRealtime() < nextUploadAllowedElapsed) return
        if (!uploadInFlight.compareAndSet(false, true)) return
        executor.execute {
            try {
                GpsUploader(this, queue).uploadPending()
                uploadBackoffMs = 2_000L
                nextUploadAllowedElapsed = 0L
                if (TrackerState.lastFixElapsed(this) > 0) {
                    TrackerState.setLastStatus(this, "READY | server connected | ${queue.count()} queued")
                }
            } catch (_: Exception) {
                val jitter = Random.nextLong(0L, (uploadBackoffMs / 4).coerceAtLeast(1L))
                nextUploadAllowedElapsed = SystemClock.elapsedRealtime() + uploadBackoffMs + jitter
                uploadBackoffMs = min(uploadBackoffMs * 2, MAX_UPLOAD_BACKOFF_MS)
                TrackerState.setLastStatus(this, "Offline | ${queue.count()} queued")
            } finally {
                uploadInFlight.set(false)
            }
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun registerNetworkCallback() {
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {
            // Not registered yet.
        }
        connectivityManager.registerDefaultNetworkCallback(networkCallback)
    }

    private fun releaseRuntimeResources() {
        handler.removeCallbacks(uploadRetry)
        handler.removeCallbacks(healthCheck)
        if (::locationClient.isInitialized) locationClient.removeLocationUpdates(locationCallback)
        if (::locationManager.isInitialized) locationManager.unregisterGnssStatusCallback(gnssCallback)
        if (::connectivityManager.isInitialized) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback)
            } catch (_: Exception) {
                // Not registered.
            }
        }
    }

    private fun stopTracking() {
        releaseRuntimeResources()
        TrackerState.setTracking(this, false)
        TrackerState.setResumePending(this, false)
        TrackerState.setLastStatus(this, "Stopped")
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        releaseRuntimeResources()
        executor.shutdown()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Bus GPS tracking", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Keeps the sightseeing bus location active"
                setShowBadge(false)
            },
        )
    }

    private fun notification(message: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stopIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, GpsTrackingService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_bus)
            .setContentTitle("Shkodra bus GPS is active")
            .setContentText(message)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .addAction(0, "Stop", stopIntent)
            .build()
    }

    private fun updateNotification(message: String) {
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(
            NOTIFICATION_ID,
            notification(message),
        )
    }

    companion object {
        const val ACTION_STOP = "com.sightseeingshkodra.gps.STOP"
        private const val CHANNEL_ID = "gps_tracking"
        private const val NOTIFICATION_ID = 901
        private const val LOCATION_INTERVAL_MS = 1_000L
        private const val MIN_LOCATION_INTERVAL_MS = 500L
        private const val UPLOAD_RETRY_MS = 30_000L
        private const val HEALTH_CHECK_MS = 10_000L
        private const val GPS_STALE_SECONDS = 10L
        private const val STATIONARY_HEARTBEAT_MS = 15_000L
        private const val QUEUE_WARNING_COUNT = 1_000L
        private const val MAX_UPLOAD_BACKOFF_MS = 5 * 60_000L
    }
}
