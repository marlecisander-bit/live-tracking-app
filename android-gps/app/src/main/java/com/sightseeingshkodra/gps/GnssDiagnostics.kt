package com.sightseeingshkodra.gps

import android.location.GnssStatus
import android.os.Build

data class GnssSnapshot(
    val visible: Int = 0,
    val used: Int = 0,
    val constellations: String = "None",
    val frequencyBands: String = "Unknown",
    val cn0MedianDbHz: Double? = null,
    val cn0MinDbHz: Double? = null,
    val cn0MaxDbHz: Double? = null,
) {
    fun display(): String {
        val signal = cn0MedianDbHz?.let {
            "C/N0 med ${"%.1f".format(it)} (${"%.1f".format(cn0MinDbHz)}-${"%.1f".format(cn0MaxDbHz)}) dB-Hz"
        } ?: "C/N0 unavailable"
        return "$used/$visible used | $constellations | $frequencyBands | $signal"
    }
}

object GnssDiagnostics {
    fun from(status: GnssStatus): GnssSnapshot {
        var used = 0
        val visibleByConstellation = linkedMapOf<String, Int>()
        val usedByConstellation = linkedMapOf<String, Int>()
        val bandCounts = linkedMapOf<String, Int>()
        val cn0Values = mutableListOf<Double>()

        for (index in 0 until status.satelliteCount) {
            val constellation = constellationName(status.getConstellationType(index))
            visibleByConstellation[constellation] = (visibleByConstellation[constellation] ?: 0) + 1
            if (status.usedInFix(index)) {
                used += 1
                usedByConstellation[constellation] = (usedByConstellation[constellation] ?: 0) + 1
            }
            val cn0 = status.getCn0DbHz(index).toDouble()
            if (cn0.isFinite() && cn0 >= 0) cn0Values += cn0
            if (Build.VERSION.SDK_INT >= 26 && status.hasCarrierFrequencyHz(index)) {
                val band = frequencyBand(constellation, status.getCarrierFrequencyHz(index) / 1_000_000.0)
                if (band != "UNKNOWN") bandCounts[band] = (bandCounts[band] ?: 0) + 1
            }
        }

        val sortedCn0 = cn0Values.sorted()
        val median = when {
            sortedCn0.isEmpty() -> null
            sortedCn0.size % 2 == 1 -> sortedCn0[sortedCn0.size / 2]
            else -> (sortedCn0[sortedCn0.size / 2 - 1] + sortedCn0[sortedCn0.size / 2]) / 2.0
        }
        return GnssSnapshot(
            visible = status.satelliteCount,
            used = used,
            constellations = visibleByConstellation.entries.joinToString(", ") {
                "${it.key}:${usedByConstellation[it.key] ?: 0}/${it.value}"
            }.ifEmpty { "None" },
            frequencyBands = bandCounts.entries.joinToString(", ") { "${it.key}:${it.value}" }
                .ifEmpty { "UNKNOWN" },
            cn0MedianDbHz = median,
            cn0MinDbHz = sortedCn0.firstOrNull(),
            cn0MaxDbHz = sortedCn0.lastOrNull(),
        )
    }

    private fun constellationName(type: Int): String = when (type) {
        GnssStatus.CONSTELLATION_GPS -> "GPS"
        GnssStatus.CONSTELLATION_GLONASS -> "GLONASS"
        GnssStatus.CONSTELLATION_GALILEO -> "Galileo"
        GnssStatus.CONSTELLATION_BEIDOU -> "BeiDou"
        GnssStatus.CONSTELLATION_QZSS -> "QZSS"
        7 -> "NavIC"
        GnssStatus.CONSTELLATION_SBAS -> "SBAS"
        else -> "Other"
    }

    private fun frequencyBand(constellation: String, mhz: Double): String = when {
        mhz in 1560.0..1610.0 -> when (constellation) {
            "Galileo" -> "Galileo E1"
            "BeiDou" -> "BeiDou B1"
            "QZSS" -> "QZSS L1"
            else -> "$constellation L1"
        }
        mhz in 1160.0..1195.0 -> when (constellation) {
            "Galileo" -> "Galileo E5a"
            "BeiDou" -> "BeiDou B2a"
            "QZSS" -> "QZSS L5"
            "NavIC" -> "NavIC L5"
            else -> "$constellation L5"
        }
        mhz in 1195.0..1245.0 -> when (constellation) {
            "Galileo" -> "Galileo E5b"
            "BeiDou" -> "BeiDou B2"
            else -> "$constellation 1200MHz"
        }
        else -> "UNKNOWN"
    }
}
