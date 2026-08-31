package com.sightseeingshkodra.gps

import android.content.Context

object TrackerState {
    private const val FILE = "tracker_state"
    private const val TRACKING = "tracking"
    private const val LAST_FIX = "last_fix"
    private const val LAST_UPLOAD = "last_upload"
    private const val LAST_STATUS = "last_status"
    private const val LAST_DIAGNOSTICS = "last_diagnostics"
    private const val LAST_REJECTION = "last_rejection"
    private const val LAST_FIX_ELAPSED = "last_fix_elapsed"
    private const val LAST_SEQUENCE = "last_sequence"
    private const val POWER_STATUS = "power_status"
    private const val RESUME_PENDING = "resume_pending"

    private fun preferences(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun isTracking(context: Context): Boolean =
        preferences(context).getBoolean(TRACKING, false)

    fun setTracking(context: Context, value: Boolean) {
        preferences(context).edit().putBoolean(TRACKING, value).apply()
    }

    fun setLastFix(context: Context, value: String) {
        preferences(context).edit().putString(LAST_FIX, value).apply()
    }

    fun lastFix(context: Context): String =
        preferences(context).getString(LAST_FIX, "Waiting for GPS fix")!!

    fun setLastUpload(context: Context, value: String) {
        preferences(context).edit().putString(LAST_UPLOAD, value).apply()
    }

    fun lastUpload(context: Context): String =
        preferences(context).getString(LAST_UPLOAD, "Nothing uploaded yet")!!

    fun setLastStatus(context: Context, value: String) {
        preferences(context).edit().putString(LAST_STATUS, value).apply()
    }

    fun lastStatus(context: Context): String =
        preferences(context).getString(LAST_STATUS, "Stopped")!!

    fun setDiagnostics(context: Context, value: String) {
        preferences(context).edit().putString(LAST_DIAGNOSTICS, value).apply()
    }

    fun diagnostics(context: Context): String =
        preferences(context).getString(LAST_DIAGNOSTICS, "Waiting for satellite data")!!

    fun setLastRejection(context: Context, value: String) {
        preferences(context).edit().putString(LAST_REJECTION, value).apply()
    }

    fun lastRejection(context: Context): String =
        preferences(context).getString(LAST_REJECTION, "No fixes rejected")!!

    fun setLastFixElapsed(context: Context, value: Long) {
        preferences(context).edit().putLong(LAST_FIX_ELAPSED, value).apply()
    }

    fun lastFixElapsed(context: Context): Long =
        preferences(context).getLong(LAST_FIX_ELAPSED, 0L)

    @Synchronized
    fun nextSequence(context: Context): Long {
        val next = preferences(context).getLong(LAST_SEQUENCE, 0L) + 1L
        preferences(context).edit().putLong(LAST_SEQUENCE, next).commit()
        return next
    }

    fun setPowerStatus(context: Context, value: String) {
        preferences(context).edit().putString(POWER_STATUS, value).apply()
    }

    fun powerStatus(context: Context): String =
        preferences(context).getString(POWER_STATUS, "Power status unavailable")!!

    fun setResumePending(context: Context, value: Boolean) {
        preferences(context).edit().putBoolean(RESUME_PENDING, value).apply()
    }

    fun resumePending(context: Context): Boolean =
        preferences(context).getBoolean(RESUME_PENDING, false)
}
