package com.margot.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class LocationReliabilityTest {
    private static final double WALL = 1_800_000_000_000.0;
    private static LocationPolicy.Fix fix(double metres, double accuracy, double at, double speed) {
        return new LocationPolicy.Fix(38.0 + metres / 111_195.0, -25.0, accuracy, WALL + at, speed);
    }

    @Test public void staleAndOutOfOrderSamplesCannotExtendPresence() {
        LocationPolicy p = new LocationPolicy();
        assertTrue(p.observe(fix(0, 10, 0, 0), WALL, 0));
        assertFalse(p.observe(fix(100, 10, -1, 0), WALL + 1, 1));
        assertFalse(p.observe(fix(100, 10, 10, 0), WALL + 100_000, 100_000));
        assertFalse(p.observe(fix(0, 101, 100_000, 0), WALL + 100_000, 100_000));
        assertEquals(0, p.latest.capturedAt - WALL, 0);
    }

    @Test public void indoorJitterDoesNotUploadEveryCallback() {
        LocationPolicy p = new LocationPolicy();
        for (int second = 0; second <= 3600; second += 30) {
            double t = second * 1000.0;
            LocationPolicy.Fix sample = fix(second % 60 == 0 ? -15 : 15, 30, t, -1);
            assertTrue(p.observe(sample, WALL + t, t));
            if (p.shouldSend(sample, WALL + t, t, false)) {
                p.attempted(t); p.completed(sample, t, true);
            }
        }
        assertTrue(p.stationary);
        assertTrue("one-hour jitter upload budget: " + p.successes, p.successes <= 23);
        assertTrue(p.successes >= 20);
    }

    @Test public void realMovementAndSensorMovementExitStationaryMode() {
        LocationPolicy p = new LocationPolicy();
        for (int t = 0; t <= 120_000; t += 30_000) p.observe(fix(0, 10, t, 0), WALL + t, t);
        assertTrue(p.stationary);
        LocationPolicy.Fix first = p.latest;
        p.attempted(120_000); p.completed(first, 120_000, true);
        LocationPolicy.Fix moved = fix(100, 10, 150_000, 1.2);
        p.observe(moved, WALL + 150_000, 150_000);
        assertFalse(p.stationary);
        assertTrue(p.shouldSend(moved, WALL + 150_000, 150_000, false));
        p.motionDetected();
        assertFalse(p.stationary);
    }

    @Test public void networkBackoffDoesNotAcknowledgeOrRetimestampSamples() {
        LocationPolicy p = new LocationPolicy();
        LocationPolicy.Fix sample = fix(0, 10, 0, 0);
        p.attempted(0); p.completed(sample, 0, false);
        assertNull(p.lastSent);
        assertFalse(p.shouldSend(sample, WALL + 4999, 4999, false));
        assertTrue(p.shouldSend(sample, WALL + 5000, 5000, false));
        assertFalse(p.shouldSend(sample, WALL + 90_001, 90_001, true));
    }

    @Test public void acquisitionUsesLessPowerOnlyInBackgroundAndRecoversOnMotion() {
        LocationAcquisitionPolicy a = new LocationAcquisitionPolicy(0);
        LocationPolicy.Fix still = fix(0, 20, 0, 0);
        a.update(false, true, still, 120_000); assertFalse(a.quiet);
        a.update(true, true, still, 120_000); assertTrue(a.quiet);
        assertFalse(a.beginBurst(239_999)); assertTrue(a.beginBurst(240_000));
        assertFalse(a.beginBurst(240_001));
        a.observe(fix(100, 20, 250_000, 1), 250_000); assertFalse(a.quiet);
        a.update(true, true, still, 260_000); assertFalse(a.quiet);
        a.update(true, true, still, 370_000); assertTrue(a.quiet);
        a.motion(375_000); assertFalse(a.quiet);
    }

    @Test public void unknownPositionNeverBecomesStationaryBecauseTimePassed() {
        LocationAcquisitionPolicy a = new LocationAcquisitionPolicy(0);
        a.update(true, false, null, 90_000); assertFalse(a.quiet);
        a.update(true, false, null, 900_000); assertFalse(a.quiet);
        a.update(true, true, fix(0, 30, 1_000_000, -1), 1_000_000); assertTrue(a.quiet);
        a.observe(fix(15, 80, 1_030_000, -1), 1_030_000);
        a.update(true, false, fix(15, 80, 1_030_000, -1), 1_030_000); assertTrue(a.quiet);
        a.update(false, false, null, 1_030_001); assertFalse(a.quiet);
    }

    @Test public void rejectedSampleWaitsForANewFixWithoutMarkingSuccess() {
        LocationPolicy p = new LocationPolicy();
        p.attempted(0); p.declined(0);
        assertNull(p.lastSent);
        assertFalse(p.shouldSend(fix(0, 10, 30_000, 0), WALL + 30_000, 30_000, false));
        assertTrue(p.shouldSend(fix(0, 10, 60_000, 0), WALL + 60_000, 60_000, false));
    }

    @Test public void onlyAnApplicationAcknowledgementIsSuccessful() {
        assertTrue(new LocationUploadResult(200, true, true).accepted);
        assertFalse(new LocationUploadResult(200, true, false).accepted);
        assertFalse(new LocationUploadResult(200, true, false).retryable);
        assertFalse(new LocationUploadResult(200, false, true).accepted);
        assertTrue(new LocationUploadResult(200, false, true).retryable);
        assertFalse(new LocationUploadResult(401, true, true).accepted);
        assertFalse(new LocationUploadResult(403, false, false).retryable);
        assertTrue(new LocationUploadResult(429, false, false).retryable);
        assertTrue(new LocationUploadResult(503, false, false).retryable);
        assertTrue(new LocationUploadResult(0, false, false).retryable);
        assertTrue(new LocationUploadResult(200, true, false, "authorization_revoked").authorizationExpired);
        assertTrue(new LocationUploadResult(200, true, false, "collection_disabled").collectionDisabled);
        assertFalse(new LocationUploadResult(200, true, false, "duplicate_or_older_location").authorizationExpired);
    }
}