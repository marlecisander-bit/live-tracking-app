package com.sightseeingshkodra.gps

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var stateText: TextView
    private lateinit var fixText: TextView
    private lateinit var uploadText: TextView
    private lateinit var diagnosticsText: TextView
    private lateinit var rejectionText: TextView
    private lateinit var powerText: TextView
    private lateinit var readinessText: TextView
    private lateinit var startButton: Button
    private val refreshHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private val refresh = object : Runnable {
        override fun run() {
            renderState()
            refreshHandler.postDelayed(this, 1_000)
        }
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            explainBackgroundLocationIfNeeded()
        } else {
            showMessage("Precise location is required to track the bus.")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildScreen())
        renderState()
    }

    override fun onResume() {
        super.onResume()
        refreshHandler.post(refresh)
    }

    override fun onPause() {
        refreshHandler.removeCallbacks(refresh)
        super.onPause()
    }

    private fun buildScreen(): ScrollView {
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(28), dp(24), dp(28))
        }

        content.addView(TextView(this).apply {
            text = "Sightseeing Shkodra"
            textSize = 27f
            setTextColor(Color.rgb(215, 25, 32))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        content.addView(TextView(this).apply {
            text = "Bus GPS master"
            textSize = 18f
            setTextColor(Color.DKGRAY)
            setPadding(0, dp(2), 0, dp(28))
        })

        stateText = statusCard(content, "STATUS")
        readinessText = statusCard(content, "READINESS CHECK")
        fixText = statusCard(content, "LAST GPS FIX")
        uploadText = statusCard(content, "LAST SERVER UPLOAD")
        diagnosticsText = statusCard(content, "SATELLITES, FREQUENCIES AND SENSORS")
        rejectionText = statusCard(content, "LAST FILTERED FIX")
        powerText = statusCard(content, "POWER AND THERMAL")

        startButton = Button(this).apply {
            setOnClickListener {
                if (TrackerState.isTracking(this@MainActivity)) stopTracking() else startTracking()
            }
        }
        content.addView(startButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply {
            topMargin = dp(20)
        })

        content.addView(Button(this).apply {
            text = "Open location permissions"
            setOnClickListener { openAppSettings() }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply {
            topMargin = dp(12)
        })

        content.addView(Button(this).apply {
            text = "Open phone GPS settings"
            setOnClickListener { startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply {
            topMargin = dp(8)
        })

        content.addView(Button(this).apply {
            text = "Open battery optimization settings"
            setOnClickListener { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)).apply {
            topMargin = dp(8)
        })

        content.addView(TextView(this).apply {
            text = "Keep this phone connected to vehicle power. Tracking continues with the screen off and displays a permanent notification."
            textSize = 14f
            setTextColor(Color.GRAY)
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(24), dp(8), 0)
        })

        return ScrollView(this).apply { addView(content) }
    }

    private fun statusCard(parent: LinearLayout, label: String): TextView {
        val density = resources.displayMetrics.density
        fun dp(value: Int) = (value * density).toInt()
        parent.addView(TextView(this).apply {
            text = label
            textSize = 12f
            setTextColor(Color.GRAY)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, dp(14), 0, dp(4))
        })
        return TextView(this).also { value ->
            value.textSize = 16f
            value.setTextColor(Color.rgb(30, 30, 30))
            value.setPadding(dp(16), dp(14), dp(16), dp(14))
            value.setBackgroundColor(Color.rgb(245, 245, 245))
            parent.addView(value, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
    }

    private fun startTracking() {
        if (!configurationIsValid()) {
            showMessage("Configure gps.endpoint and gps.deviceToken in android-gps/local.properties, then rebuild the app.")
            return
        }
        val locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
        val locationEnabled = if (Build.VERSION.SDK_INT >= 28) {
            locationManager.isLocationEnabled
        } else {
            locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
        }
        if (!locationEnabled) {
            AlertDialog.Builder(this)
                .setTitle("Turn on phone location")
                .setMessage("The Pixel location switch is off. Turn it on before starting bus tracking.")
                .setPositiveButton("Open GPS settings") { _, _ ->
                    startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                }
                .setNegativeButton("Cancel", null)
                .show()
            return
        }
        val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) permissions += Manifest.permission.POST_NOTIFICATIONS
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            permissionLauncher.launch(missing.toTypedArray())
            return
        }
        explainBackgroundLocationIfNeeded()
    }

    private fun explainBackgroundLocationIfNeeded() {
        if (
            Build.VERSION.SDK_INT >= 29 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            AlertDialog.Builder(this)
                .setTitle("Allow all-the-time location")
                .setMessage("For reliable tracking after a reboot, open Permissions → Location and select Allow all the time. Then return and press Start tracking again.")
                .setPositiveButton("Open settings") { _, _ -> openAppSettings() }
                .setNegativeButton("Track this session") { _, _ -> launchService() }
                .show()
        } else {
            launchService()
        }
    }

    private fun launchService() {
        ContextCompat.startForegroundService(this, Intent(this, GpsTrackingService::class.java))
        TrackerState.setTracking(this, true)
        renderState()
    }

    private fun stopTracking() {
        startService(Intent(this, GpsTrackingService::class.java).setAction(GpsTrackingService.ACTION_STOP))
        TrackerState.setTracking(this, false)
        renderState()
    }

    private fun renderState() {
        val tracking = TrackerState.isTracking(this)
        stateText.text = TrackerState.lastStatus(this)
        readinessText.text = readinessSummary()
        fixText.text = TrackerState.lastFix(this)
        uploadText.text = TrackerState.lastUpload(this)
        diagnosticsText.text = TrackerState.diagnostics(this)
        rejectionText.text = TrackerState.lastRejection(this)
        powerText.text = TrackerState.powerStatus(this)
        startButton.text = when {
            tracking -> "STOP TRACKING"
            TrackerState.resumePending(this) -> "RESUME TRACKING"
            else -> "START TRACKING"
        }
        startButton.setBackgroundColor(if (tracking) Color.DKGRAY else Color.rgb(215, 25, 32))
        startButton.setTextColor(Color.WHITE)
    }

    private fun configurationIsValid(): Boolean =
        BuildConfig.GPS_ENDPOINT.startsWith("https://") && BuildConfig.GPS_DEVICE_TOKEN.length >= 32

    private fun readinessSummary(): String {
        val precise = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val background = Build.VERSION.SDK_INT < 29 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        val notifications = Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val manager = getSystemService(LOCATION_SERVICE) as LocationManager
        val locationOn = if (Build.VERSION.SDK_INT >= 28) manager.isLocationEnabled
        else manager.isProviderEnabled(LocationManager.GPS_PROVIDER)
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        val batteryPolicy = powerManager.isIgnoringBatteryOptimizations(packageName)
        fun mark(value: Boolean) = if (value) "OK" else "MISSING"
        return "Precise location ${mark(precise)} | Background ${mark(background)} | " +
            "Notifications ${mark(notifications)} | Phone GPS ${mark(locationOn)} | " +
            "Battery policy ${if (batteryPolicy) "UNRESTRICTED" else "CHECK"}"
    }

    private fun openAppSettings() {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            },
        )
    }

    private fun showMessage(message: String) {
        AlertDialog.Builder(this).setMessage(message).setPositiveButton("OK", null).show()
    }
}
