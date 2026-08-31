package com.sightseeingshkodra.gps

import android.content.Context
import java.net.HttpURLConnection
import java.io.IOException
import java.net.URL
import java.time.Instant

class GpsUploader(private val context: Context, private val queue: GpsQueue) {
    private enum class SendResult { SUCCESS, RETRY, DROP }

    fun uploadPending(maxReports: Int = 1): Int {
        require(BuildConfig.GPS_ENDPOINT.startsWith("https://")) {
            "GPS endpoint is missing or is not HTTPS"
        }
        require(BuildConfig.GPS_DEVICE_TOKEN.length >= 32) {
            "GPS device token is missing or too short"
        }

        var uploaded = 0
        val liveReport = queue.latest() ?: return uploaded
        if (!process(liveReport)) return uploaded
        uploaded += 1

        // Once the newest accepted fix has reached the server, older queued
        // fixes cannot improve the live position and would block subsequent
        // one-second updates while being uploaded sequentially.
        queue.removeThroughSequence(liveReport.sequence)

        repeat((maxReports - 1).coerceAtLeast(0)) {
            val report = queue.first() ?: return uploaded
            if (!process(report)) return uploaded
            uploaded += 1
        }
        return uploaded
    }

    private fun process(report: QueuedPosition): Boolean {
            when (send(report.payload)) {
                SendResult.RETRY -> {
                    queue.incrementRetry(report.id)
                    throw IOException("Telemetry server unavailable")
                }
                SendResult.DROP -> {
                    queue.remove(report.id)
                    TrackerState.setLastRejection(context, "Server rejected an expired or invalid queued report")
                }
                SendResult.SUCCESS -> {
                    queue.remove(report.id)
                    TrackerState.setLastUpload(context, "Uploaded ${Instant.now()} (${queue.count()} queued)")
                }
            }
        return true
    }

    private fun send(payload: String): SendResult {
        val connection = URL(BuildConfig.GPS_ENDPOINT).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("x-device-token", BuildConfig.GPS_DEVICE_TOKEN)
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            when (connection.responseCode) {
                in 200..299 -> SendResult.SUCCESS
                400, 404, 409, 422 -> SendResult.DROP
                else -> SendResult.RETRY
            }
        } finally {
            connection.disconnect()
        }
    }
}
