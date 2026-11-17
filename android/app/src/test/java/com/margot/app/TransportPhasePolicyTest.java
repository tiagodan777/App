package com.margot.app;

import org.junit.Test;
import static org.junit.Assert.*;

/** Synthetic provider timing; these tests do not measure physical battery use. */
public class TransportPhasePolicyTest {
    private static final double WALL=1_800_000_000_000.0;
    private static LocationPolicy.Fix fix(double t,double x,double speed,double accuracy) {
        return new LocationPolicy.Fix(38+x/111194.9266,-25,accuracy,WALL+t,speed);
    }
    @Test public void independentProvidersConvergeWithoutFasterRequests() {
        for(double start:new double[]{2000,17000,29500,39500}) {
            TransportPhasePolicy p=new TransportPhasePolicy();double t=start,interval=30000;int captures=0;
            for(;t<3_600_000;) {
                p.observe(fix(t,t/50,20,10),WALL+t+100,t+100,true);captures++;
                assertTrue(p.requestMs>=30000);assertTrue(p.requestMs<70000);
                // Provider quantizes to 1 Hz and adds 0.5 s to replacements.
                double next=t+100+p.requestMs+(p.requestMs!=interval?500:0);
                interval=p.requestMs;t=Math.ceil(next/1000)*1000;
            }
            assertTrue("capture budget",captures<=120);
            assertTrue("converges rather than repeatedly falling back",p.alignedCaptures>20);
            assertEquals(0,p.misses);
        }
    }
    @Test public void cachedCallbacksCannotCauseARequestLoopOrExtraUploads() {
        TransportPhasePolicy p=new TransportPhasePolicy();LocationPolicy.Fix sent=fix(2000,0,20,10);
        p.observe(sent,WALL+2100,2100,true);double interval=p.requestMs;long adjustments=p.adjustments;
        for(int t=2000;t<22000;t+=1000) {
            LocationPolicy.Fix f=fix(t,t/50,20,10);p.observe(f,WALL+t+100,t+100,true);
            assertEquals(interval,p.requestMs,0);assertEquals(adjustments,p.adjustments);
            assertFalse(p.permitsUpload(f,sent));
        }
        assertTrue(p.permitsUpload(fix(32000,600,20,10),sent));
    }
    @Test public void unsupportedTimingFallsBackAndHasABoundedRetryRate() {
        TransportPhasePolicy p=new TransportPhasePolicy();
        for(int t=2000;t<=122000;t+=30000)p.observe(fix(t,t/50,20,10),WALL+t,t,true);
        assertFalse(p.active);assertEquals(30000,p.requestMs,0);assertEquals(1,p.misses);
        p.observe(fix(150000,3000,20,10),WALL+150000,150000,true);assertFalse(p.active);
        p.recovered();p.observe(fix(151000,3020,20,10),WALL+151000,151000,true);assertTrue(p.active);
    }
    @Test public void permissionConfigurationQualityAndClockLossFailClosed() {
        for(int failure=0;failure<4;failure++) {
            TransportPhasePolicy p=new TransportPhasePolicy();p.observe(fix(2000,0,20,10),WALL+2000,2000,true);
            assertTrue(p.active);
            p.observe(fix(42000,800,20,failure==1?60:10),WALL+42000+(failure==2?11000:failure==3?2000:0),42000,failure!=0);
            assertFalse(p.active);assertEquals(30000,p.requestMs,0);
        }
        for(double speed:new double[]{Double.NaN,-1,0,1,4.9,56}) {
            TransportPhasePolicy p=new TransportPhasePolicy();p.observe(fix(2000,0,speed,10),WALL+2000,2000,true);
            assertFalse(p.active);assertEquals(30000,p.requestMs,0);
        }
    }
    @Test public void stopRequiresTwoSuccessfulUploadsAndReturnsToNormalCadence() {
        TransportPhasePolicy p=new TransportPhasePolicy();LocationPolicy.Fix f=fix(2000,0,20,10);
        p.observe(f,WALL+2000,2000,true);assertFalse(p.acknowledged(f));
        f=fix(40000,760,0,10);p.observe(f,WALL+40000,40000,true);
        assertTrue(p.forceUpload());assertEquals(30000,p.requestMs,0);assertFalse(p.acknowledged(f));
        // Observed during network failure: no acknowledgement, so keep stop confirmation.
        p.observe(fix(70000,760,0,10),WALL+70000,70000,true);assertTrue(p.active);assertTrue(p.forceUpload());
        f=fix(100000,760,0,10);p.observe(f,WALL+100000,100000,true);
        assertTrue(p.acknowledged(f));assertFalse(p.active);assertFalse(p.forceUpload());
        assertEquals(30000,p.requestMs,0);
        p.observe(fix(130000,1300,20,10),WALL+130000,130000,true);assertTrue(p.active);
    }
    @Test public void resetCannotRetainAnotherOwnersStopConfirmation() {
        TransportPhasePolicy p=new TransportPhasePolicy();LocationPolicy.Fix f=fix(2000,0,20,10);
        p.observe(f,WALL+2000,2000,true);p.acknowledged(f);p.reset();
        assertFalse(p.active);assertFalse(p.acknowledged(fix(42000,0,0,10)));
        p=new TransportPhasePolicy();assertEquals(0,p.adjustments);assertEquals(0,p.misses);
    }
}
