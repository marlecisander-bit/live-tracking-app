package com.sightseeingshkodra.gps

import android.location.Location
import android.os.Build
import android.os.SystemClock
import kotlin.math.max

enum class LocationQuality { EXCELLENT, GOOD, FAIR, POOR, STALE, NO_FIX }
enum class MotionState { UNKNOWN, STATIONARY, MOVING }

data class QualityResult(
    val state: LocationQuality,
    val ageSeconds: Double,
    val reason: String,
)

object LocationQualityEvaluator {
    fun evaluate(location: Location): QualityResult {
        val ageSeconds = max(
            0.0,
            (SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000_000.0,
        )
        val state = LocationQualityPolicy.evaluate(location.accuracy, ageSeconds)
        return QualityResult(state, ageSeconds, "accuracy=${location.accuracy.toInt()}m age=${"%.1f".format(ageSeconds)}s")
    }
}

object LocationQualityPolicy {
    fun evaluate(accuracyMeters: Float, ageSeconds: Double): LocationQuality = when {
            ageSeconds > 10.0 -> LocationQuality.STALE
            accuracyMeters <= 5f && ageSeconds <= 2.0 -> LocationQuality.EXCELLENT
            accuracyMeters <= 10f && ageSeconds <= 3.0 -> LocationQuality.GOOD
            accuracyMeters <= 20f && ageSeconds <= 5.0 -> LocationQuality.FAIR
            else -> LocationQuality.POOR
        }
}

class MotionStateDetector {
    private var state = MotionState.UNKNOWN
    private var movingFixes = 0
    private var stationarySince = 0L
    private val recent = ArrayDeque<Location>()

    fun update(location: Location): MotionState {
        recent.addLast(Location(location))
        while (recent.size > 12) recent.removeFirst()

        val speed = if (location.hasSpeed()) location.speed else 0f
        val displacement = if (recent.size >= 2) recent.first().distanceTo(recent.last()) else 0f
        if (speed >= 2.0f || displacement >= 12f) {
            movingFixes += 1
            stationarySince = 0L
            if (movingFixes >= 3 || displacement >= 12f) state = MotionState.MOVING
        } else if (speed <= 0.7f && displacement < 12f) {
            movingFixes = 0
            if (stationarySince == 0L) stationarySince = SystemClock.elapsedRealtime()
            if (SystemClock.elapsedRealtime() - stationarySince >= 8_000L) state = MotionState.STATIONARY
        } else {
            movingFixes = 0
            stationarySince = 0L
        }
        return state
    }
}

fun Location.speedAccuracyMpsOrNull(): Float? =
    if (Build.VERSION.SDK_INT >= 26 && hasSpeedAccuracy()) speedAccuracyMetersPerSecond else null

fun Location.bearingAccuracyDegOrNull(): Float? =
    if (Build.VERSION.SDK_INT >= 26 && hasBearingAccuracy()) bearingAccuracyDegrees else null
