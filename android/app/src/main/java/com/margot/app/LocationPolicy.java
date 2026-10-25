package com.margot.app;

import java.util.Map;

/** Pure policy: no timers, GPS access, persistence or network side effects. Times are milliseconds. */
public final class LocationPolicy {
    public static final String VERSION = "native-battery-2";
    public static final double MAX_AGE_MS = 90_000;
    public static final double MAX_ACCURACY = 100;
    public static final class Fix {
        public final double latitude, longitude, accuracy, capturedAt, speed;
        public Fix(double latitude, double longitude, double accuracy, double capturedAt, double speed) {
            this.latitude = latitude; this.longitude = longitude; this.accuracy = accuracy;
            this.capturedAt = capturedAt; this.speed = speed;
        }
    }
    public double movingSendMs = 60_000, stationarySendMs = 180_000, minimumSendMs = 5_000;
    public double movementMetres = 20, stationaryAfterMs = 120_000, androidRequestMs = 30_000;
    public Fix latest, lastSent;
    private Fix anchor;
    private double anchorAt, previousObservation = -Double.MAX_VALUE;
    private int stableSamples;
    public boolean stationary;
    public long received, rejected, attempts, successes, failures;
    private double lastSuccess = -Double.MAX_VALUE, lastAttempt = -Double.MAX_VALUE, retryAt;
    private int consecutiveFailures;

    public boolean configure(Map<String, Double> values) {
        if (values.size() != 6) return false;
        String[] keys = {"moving_send_seconds", "stationary_send_seconds", "minimum_send_seconds",
            "movement_metres", "stationary_after_seconds", "android_request_seconds"};
        double[] low = {15, 60, 5, 10, 60, 10}, high = {60, 240, 30, 25, 300, 30};
        double[] v = new double[6];
        for (int i=0;i<6;i++) {
            Double n = values.get(keys[i]);
            if (n == null || !Double.isFinite(n) || n < low[i] || n > high[i]) return false;
            v[i] = n;
        }
        if (v[2] > v[0] || v[1] < v[0]) return false;
        movingSendMs=v[0]*1000; stationarySendMs=v[1]*1000; minimumSendMs=v[2]*1000;
        movementMetres=v[3]; stationaryAfterMs=v[4]*1000; androidRequestMs=v[5]*1000;
        return true;
    }
    public static boolean usable(Fix fix, double wallNow) {
        return fix != null && Double.isFinite(fix.latitude) && Double.isFinite(fix.longitude)
            && Double.isFinite(fix.accuracy) && Double.isFinite(fix.capturedAt)
            && Math.abs(fix.latitude)<=90 && Math.abs(fix.longitude)<=180
            && fix.accuracy>0 && fix.accuracy<=MAX_ACCURACY
            && wallNow-fix.capturedAt>=-5000 && wallNow-fix.capturedAt<=MAX_AGE_MS;
    }
    public boolean observe(Fix fix, double wallNow, double elapsedNow) {
        received++;
        if (!usable(fix,wallNow) || (latest!=null && fix.capturedAt<=latest.capturedAt)) {
            rejected++; return false;
        }
        // A sudden, much less precise fix must not replace a recent reliable position.
        if (latest!=null && wallNow-latest.capturedAt<60_000 && latest.accuracy<=25
            && fix.accuracy>50 && distance(latest,fix)>50) { rejected++; return false; }
        latest=fix;
        boolean stable = fix.accuracy<=50 && (!Double.isFinite(fix.speed) || fix.speed<0.5);
        if (!stable || anchor==null || elapsedNow-previousObservation>60_000
            || distance(anchor,fix)>Math.max(15,Math.min(50,anchor.accuracy+fix.accuracy))) {
            anchor=fix; anchorAt=elapsedNow; stableSamples=0; stationary=false;
        }
        stableSamples++;
        previousObservation=elapsedNow;
        stationary=stable && stableSamples>=3 && elapsedNow-anchorAt>=stationaryAfterMs;
        return true;
    }
    public boolean shouldSend(Fix fix, double wallNow, double elapsedNow, boolean force) {
        if (!usable(fix,wallNow) || elapsedNow<retryAt || elapsedNow-lastAttempt<5000) return false;
        if (lastSent==null) return true;
        if (fix.capturedAt<=lastSent.capturedAt) return false;
        double elapsed=elapsedNow-lastSuccess;
        if (elapsed<minimumSendMs) return false;
        return force || distance(lastSent,fix)>=Math.max(movementMetres,lastSent.accuracy+fix.accuracy)
            || elapsed >= (stationary ? stationarySendMs : movingSendMs);
    }
    public void attempted(double now) { attempts++; lastAttempt=now; }
    public void completed(Fix fix, double now, boolean success) {
        if (success) {
            successes++; lastSent=fix; lastSuccess=now; consecutiveFailures=0; retryAt=0;
        } else {
            failures++; consecutiveFailures++;
            retryAt=now+Math.min(120_000, 5000*Math.pow(2,Math.min(5,consecutiveFailures-1)));
        }
    }
    public void declined(double now) { failures++; retryAt=now+movingSendMs; }
    public void motionDetected() { stationary=false; anchor=null; stableSamples=0; }
    public double retryDelay(double now) { return Math.max(0,retryAt-now); }
    public static double distance(Fix a, Fix b) {
        double p=Math.toRadians(b.latitude-a.latitude), l=Math.toRadians(b.longitude-a.longitude);
        double h=Math.pow(Math.sin(p/2),2)+Math.cos(Math.toRadians(a.latitude))
            *Math.cos(Math.toRadians(b.latitude))*Math.pow(Math.sin(l/2),2);
        return 12_742_000*Math.asin(Math.sqrt(Math.min(1,h)));
    }
}