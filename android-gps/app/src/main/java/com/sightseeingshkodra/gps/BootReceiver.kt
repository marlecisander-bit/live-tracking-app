package com.sightseeingshkodra.gps

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED)) return
        if (!TrackerState.isTracking(context)) return

        // Modern Android may reject an automatic location foreground-service
        // start after boot. Preserve intent and ask the operator to resume.
        TrackerState.setResumePending(context, true)
        TrackerState.setTracking(context, false)
        TrackerState.setLastStatus(context, "DEGRADED | tracking needs resume after reboot")

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Tracking recovery", NotificationManager.IMPORTANCE_HIGH),
        )
        val openApp = PendingIntent.getActivity(
            context,
            20,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        manager.notify(
            NOTIFICATION_ID,
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_bus)
                .setContentTitle("Bus tracking needs to be resumed")
                .setContentText("Tap to reopen the Vehicle Agent and resume tracking.")
                .setContentIntent(openApp)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build(),
        )
    }

    companion object {
        private const val CHANNEL_ID = "tracking_recovery"
        private const val NOTIFICATION_ID = 902
    }
}
