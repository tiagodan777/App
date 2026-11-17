package com.margot.app;

/** Align an OS-owned request without requesting more often than the existing 30 s baseline. */
public final class TransportPhasePolicy {
    public static final long BASE_INTERVAL_MS=30_000, PERIOD_MS=40_000;
    public static final double GRID_TOLERANCE_MS=750;
    private static final double COOLDOWN_MS=120_000;
    public boolean active;
    public double requestMs=BASE_INTERVAL_MS;
    public long adjustments, misses, alignedCaptures;
    private double retryAfter, clockWall, clockElapsed, expectedCapture;
    private double lastDecisionCapture=-Double.MAX_VALUE;
    private int consecutiveMisses;
    private boolean observedStop;
    private double schedulingBias=500;
    private LocationPolicy.Fix stopObservation, lastAcknowledged;

    public void observe(LocationPolicy.Fix fix,double wall,double elapsed,boolean enabled) {
        if (!enabled) {reset();return;}
        if (active && Math.abs(wall-clockWall-(elapsed-clockElapsed))>1_000) {fail(elapsed);return;}
        if (!LocationPolicy.usable(fix,wall) || fix.accuracy>25 || wall-fix.capturedAt>10_000) {
            if(active)fail(elapsed);return;
        }
        if (!active) {
            if(elapsed<retryAfter || !Double.isFinite(fix.speed) || fix.speed<5 || fix.speed>55)return;
            active=true;clockWall=wall;clockElapsed=elapsed;consecutiveMisses=0;
        }
        if(fix.speed>=5)observedStop=false;
        else if(fix.speed>=0 && fix.speed<3)observedStop=true;
        else if(stopObservation!=null && fix.capturedAt-stopObservation.capturedAt>=20_000)
            observedStop=LocationPolicy.distance(stopObservation,fix)<=Math.max(20,stopObservation.accuracy+fix.accuracy);
        if(stopObservation==null || fix.capturedAt-stopObservation.capturedAt>=20_000)stopObservation=fix;
        // Updating a request may immediately replay a cached fix. Never use that
        // replay, or an early first callback, to create a re-registration loop.
        if(fix.capturedAt-lastDecisionCapture<20_000)return;
        lastDecisionCapture=fix.capturedAt;
        if(observedStop) {requestMs=BASE_INTERVAL_MS;expectedCapture=0;return;}
        double error=Math.abs(fix.capturedAt-Math.rint(fix.capturedAt/PERIOD_MS)*PERIOD_MS);
        if(error<=GRID_TOLERANCE_MS) {
            alignedCaptures++;consecutiveMisses=0;expectedCapture=0;requestMs=PERIOD_MS;return;
        }
        if(expectedCapture>0) {
            schedulingBias=Math.max(0,Math.min(5_000,schedulingBias+fix.capturedAt-expectedCapture));
            if(++consecutiveMisses>=3) {fail(elapsed);return;}
        }
        // A 40 s transport cadence leaves room to correct delivery jitter while
        // keeping every requested/minimum interval >= the original 30 s.
        double target=Math.ceil((wall+BASE_INTERVAL_MS-GRID_TOLERANCE_MS)/PERIOD_MS)*PERIOD_MS;
        requestMs=Math.max(BASE_INTERVAL_MS,target-schedulingBias-wall);
        expectedCapture=target;adjustments++;
    }
    public boolean permitsUpload(LocationPolicy.Fix fix,LocationPolicy.Fix lastSent) {
        // Request replacement can deliver an initial cached/fresh fix immediately.
        // Never turn those callbacks into extra periodic uploads.
        return !active || lastSent==null || fix.capturedAt-lastSent.capturedAt>=BASE_INTERVAL_MS-1_000;
    }
    public boolean forceUpload() {return active && observedStop;}
    public boolean acknowledged(LocationPolicy.Fix fix) {
        if(!active)return false;
        // Two accepted positions, not just two observed fixes: a failed HTTP
        // attempt must not end the stop confirmation before the server sees it.
        boolean stopped=lastAcknowledged!=null && (fix.speed<3 || !Double.isFinite(fix.speed))
            && fix.capturedAt-lastAcknowledged.capturedAt>=20_000
            && LocationPolicy.distance(lastAcknowledged,fix)<=Math.max(20,lastAcknowledged.accuracy+fix.accuracy);
        lastAcknowledged=fix;
        if(stopped) {reset();return true;}
        return false;
    }
    public void recovered() {reset();retryAfter=0;}
    public void fail(double elapsed) {misses++;reset();retryAfter=elapsed+COOLDOWN_MS;}
    public void reset() {
        active=false;requestMs=BASE_INTERVAL_MS;expectedCapture=0;schedulingBias=500;
        lastDecisionCapture=-Double.MAX_VALUE;consecutiveMisses=0;
        observedStop=false;stopObservation=null;lastAcknowledged=null;
    }
}
