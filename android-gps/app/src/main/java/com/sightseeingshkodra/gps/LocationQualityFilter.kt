package com.sightseeingshkodra.gps

import android.location.Location
import android.os.Build
import android.os.SystemClock
import kotlin.math.max

data class FixDecision(val accepted: Boolean, val reason: String = "")

class LocationQualityFilter {
    private var lastAccepted: Location? = null

    fun evaluate(location: Location): FixDecision {
        val isMock = if (Build.VERSION.SDK_INT >= 31) location.isMock else location.isFromMockProvider
        if (isMock) return FixDecision(false, "Mock location rejected")
        if (!location.hasAccuracy() || !location.accuracy.isFinite()) {
            return FixDecision(false, "GPS accuracy unavailable")
        }
        if (location.accuracy > MAX_ACCURACY_METERS) {
            return FixDecision(false, "Weak fix: +/-${location.accuracy.toInt()} m")
        }

        val ageMillis = ((SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000L)
            .coerceAtLeast(0L)
        if (ageMillis > MAX_FIX_AGE_MS) return FixDecision(false, "Stale fix: ${ageMillis / 1000}s old")

        val previous = lastAccepted
        if (previous != null) {
            val deltaSeconds = (location.time - previous.time) / 1000.0
            if (deltaSeconds <= 0) return FixDecision(false, "Out-of-order GPS timestamp")
            if (deltaSeconds < JUMP_CHECK_MAX_GAP_SECONDS) {
                val distance = previous.distanceTo(location).toDouble()
                val uncertainty = previous.accuracy + location.accuracy
                val impliedKmh = max(0.0, distance - uncertainty) / deltaSeconds * 3.6
                if (impliedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
                    return FixDecision(false, "Impossible jump: ${impliedKmh.toInt()} km/h")
                }
            }
        }

        lastAccepted = Location(location)
        return FixDecision(true)
    }

    companion object {
        private const val MAX_ACCURACY_METERS = 50f
        private const val MAX_FIX_AGE_MS = 15_000L
        private const val MAX_PLAUSIBLE_SPEED_KMH = 180.0
        private const val JUMP_CHECK_MAX_GAP_SECONDS = 120.0
    }
}
