package com.sightseeingshkodra.gps

import org.junit.Assert.assertEquals
import org.junit.Test

class LocationQualityPolicyTest {
    @Test fun classifiesExcellentFix() {
        assertEquals(LocationQuality.EXCELLENT, LocationQualityPolicy.evaluate(4f, 1.0))
    }

    @Test fun classifiesGoodAndFairBoundaries() {
        assertEquals(LocationQuality.GOOD, LocationQualityPolicy.evaluate(10f, 3.0))
        assertEquals(LocationQuality.FAIR, LocationQualityPolicy.evaluate(20f, 5.0))
    }

    @Test fun staleAgeOverridesAccuracy() {
        assertEquals(LocationQuality.STALE, LocationQualityPolicy.evaluate(2f, 10.1))
    }

    @Test fun poorAccuracyIsNotPromoted() {
        assertEquals(LocationQuality.POOR, LocationQualityPolicy.evaluate(21f, 1.0))
    }
}
