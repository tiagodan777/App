package com.margot.app;

/** Bounds recovery when a registered provider stops delivering usable positions. */
public final class LocationAcquisitionRecovery {
    public static final long SILENCE_MS = 180_000;
    public static final long MAX_RETRY_MS = 900_000;
    private long nextRecoveryAt;
    private long retryMs = SILENCE_MS;
    public long recoveries;

    public LocationAcquisitionRecovery(long now) { received(now); }

    public void received(long now) {
        retryMs = SILENCE_MS;
        nextRecoveryAt = now + SILENCE_MS;
    }

    public boolean shouldRecover(long now, boolean permitted) {
        if (!permitted || now < nextRecoveryAt) return false;
        recoveries++;
        nextRecoveryAt = now + retryMs;
        retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
        return true;
    }
}
