package com.margot.app;

/** Chooses sensor effort independently of upload frequency. All times are monotonic ms. */
public final class LocationAcquisitionPolicy {
    public static final long BURST_MS = 20_000, BURST_INTERVAL_MS = 120_000;
    private double movingUntil, lastBurstAt = -Double.MAX_VALUE;
    private LocationPolicy.Fix quietAnchor;
    public boolean quiet;

    public LocationAcquisitionPolicy(double now) { movingUntil = now; }

    public void observe(LocationPolicy.Fix fix, double now) {
        if (quiet && (fix.speed >= 0.8 || (quietAnchor != null
            && LocationPolicy.distance(quietAnchor, fix)
                >= Math.max(20, quietAnchor.accuracy + fix.accuracy)))) motion(now);
        if (quiet && quietAnchor == null) quietAnchor = fix;
    }

    public void motion(double now) {
        quiet = false;
        quietAnchor = null;
        movingUntil = now + 120_000;
    }

    public boolean update(boolean background, boolean stationary, LocationPolicy.Fix fix, double now) {
        boolean previous = quiet;
        if (!background) {
            quiet = false;
            quietAnchor = null;
        } else if (!quiet && now >= movingUntil && stationary) {
            quiet = true;
            quietAnchor = fix;
            lastBurstAt = now;
        }
        return previous != quiet;
    }

    public boolean beginBurst(double now) {
        if (!quiet || now - lastBurstAt < BURST_INTERVAL_MS) return false;
        lastBurstAt = now;
        return true;
    }
}
