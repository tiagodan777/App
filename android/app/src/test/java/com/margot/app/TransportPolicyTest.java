package com.margot.app;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

/** Production policy with synthetic sensor/clock/network data, not an Android device test. */
public class TransportPolicyTest {
    private static final double WALL=1_800_000_000_000.0;
    private static Map<String,Double> config() {
        Map<String,Double> c=new HashMap<>();
        c.put("moving_send_seconds",60.0);c.put("stationary_send_seconds",180.0);
        c.put("minimum_send_seconds",5.0);c.put("movement_metres",20.0);
        c.put("stationary_after_seconds",120.0);c.put("android_request_seconds",30.0);
        c.put("transport_alignment_version",1.0);return c;
    }
    private static LocationPolicy.Fix fix(double t,double speed,double accuracy) {
        return new LocationPolicy.Fix(38+t/1000*speed/111194.9266,-25,accuracy,WALL+t,speed);
    }
    @Test public void denseCallbacksAndForceRespectTransportBudget() {
        for (int kmh:new int[]{30,60,100}) for (boolean enabled:new boolean[]{false,true}) {
            LocationPolicy p=new LocationPolicy();if(enabled)assertTrue(p.configure(config()));
            for(int t=0;t<=3_600_000;t+=1000) {
                LocationPolicy.Fix f=fix(t,kmh/3.6,10);
                assertTrue(p.observe(f,WALL+t,t));
                if(p.shouldSend(f,WALL+t,t,true)){p.attempted(t);p.completed(f,t,true);}
            }
            assertEquals(enabled?361:721,p.successes);
        }
    }
    @Test public void transportDoesNotIncreaseConfiguredAcquisitionFrequency() {
        LocationPolicy p=new LocationPolicy();p.configure(config());
        for(int t=0;t<=60_000;t+=30_000) {
            LocationPolicy.Fix f=fix(t,100/3.6,10);p.observe(f,WALL+t,t);
            assertEquals(30_000,p.requestInterval(WALL+t),0);
            assertTrue("Each fresh 30 s capture remains eligible after the ACK",p.shouldSend(f,WALL+t,t,false));
            p.attempted(t);p.completed(f,t+1000,true);
        }
        assertEquals(3,p.successes);
        // Unknown speed, low precision, a stale fix and a fresh policy must also
        // retain the standard interval, rather than escalating to 10 s.
        for(double speed:new double[]{-1,0,1,5,55}) for(double accuracy:new double[]{10,60}) {
            LocationPolicy q=new LocationPolicy();q.configure(config());
            q.observe(fix(0,speed,accuracy),WALL,0);
            assertEquals(30_000,q.requestInterval(WALL),0);
            assertEquals(30_000,q.requestInterval(WALL+120_000),0);
        }
        LocationPolicy q=new LocationPolicy();q.configure(config());
        assertEquals(30_000,q.requestInterval(WALL),0);
        Map<String,Double> custom=config();custom.put("android_request_seconds",25.0);
        assertTrue(q.configure(custom));assertEquals(25_000,q.requestInterval(WALL),0);
        LocationPolicy.Fix stopped=fix(65_000,0,10);p.observe(stopped,WALL+65_000,65_000);
        assertEquals(30_000,p.requestInterval(WALL+65_000),0);
        LocationPolicy.Fix settled=fix(121_000,0,10);p.observe(settled,WALL+121_000,121_000);
        assertFalse(p.inTransport(settled,WALL+121_000));
        assertEquals(30_000,p.requestInterval(WALL+121_000),0);
        assertFalse(p.inTransport(fix(66_000,-1,10),WALL+66_000));
        assertFalse(p.inTransport(fix(66_000,20,60),WALL+66_000));
        assertFalse(p.inTransport(fix(66_000,20,10),WALL+82_000));
    }
    @Test public void networkPowerAndStationaryRecoveryKeepExistingBounds() {
        LocationPolicy p=new LocationPolicy();p.configure(config());
        LocationPolicy.Fix f=fix(0,20,10);p.observe(f,WALL,0);p.attempted(0);p.completed(f,0,false);
        assertNull(p.lastSent);
        assertFalse(p.shouldSend(fix(4000,20,10),WALL+4000,4000,true));
        assertTrue(p.shouldSend(fix(5000,20,10),WALL+5000,5000,false));
        assertFalse(p.shouldSend(f,WALL+90_001,90_001,true));
        LocationAcquisitionRecovery recovery=new LocationAcquisitionRecovery(0);
        assertFalse(recovery.shouldRecover(1_000_000,false));
        recovery.received(1_000_000);
        assertFalse(recovery.shouldRecover(1_179_999,true));
        assertTrue(recovery.shouldRecover(1_180_000,true));
        p=new LocationPolicy();p.configure(config());
        for(int t=0;t<=3_600_000;t+=30_000) {
            f=fix(t,0,10);p.observe(f,WALL+t,t);
            if(p.shouldSend(f,WALL+t,t,false)){p.attempted(t);p.completed(f,t,true);}
        }
        assertTrue(p.stationary);assertTrue(p.successes<=23);
        assertEquals(30_000,p.requestInterval(WALL+3_600_000),0);
        p.motionDetected();assertEquals(30_000,p.requestInterval(WALL+3_600_001),0);
    }
    @Test public void stopIsObservedTwiceAtTheUnchangedThirtySecondCadence() {
        LocationPolicy p=new LocationPolicy();p.configure(config());
        LocationPolicy.Fix moving=fix(60_000,20,10);p.observe(moving,WALL+60_000,60_000);
        p.attempted(60_000);p.completed(moving,61_000,true);
        for(int t:new int[]{90_000,120_000}) {
            LocationPolicy.Fix stop=new LocationPolicy.Fix(moving.latitude,moving.longitude,10,WALL+t,0);
            p.observe(stop,WALL+t,t);
            assertEquals(30_000,p.requestInterval(WALL+t),0);
            assertTrue(p.shouldSend(stop,WALL+t,t,false));
            p.attempted(t);p.completed(stop,t+1000,true);
        }
        LocationPolicy.Fix settled=new LocationPolicy.Fix(moving.latitude,moving.longitude,10,WALL+150_000,0);
        p.observe(settled,WALL+150_000,150_000);
        assertFalse(p.inTransport(settled,WALL+150_000));
        assertFalse(p.shouldSend(settled,WALL+150_000,150_000,false));
    }
    @Test public void capabilityRollbackAndOwnerResetAreSafe() {
        LocationPolicy p=new LocationPolicy();Map<String,Double> c=config();assertTrue(p.configure(c));
        c.remove("transport_alignment_version");assertTrue(p.configure(c));assertFalse(p.transportAlignment);
        c.put("transport_alignment_version",2.0);assertFalse(p.configure(c));assertFalse(p.transportAlignment);
        p=new LocationPolicy();p.configure(config());assertNull(p.latest);assertNull(p.lastSent);
    }
    @Test public void boardingStopAndRestartUseActualAcquisitionAndUploadPolicy() {
        LocationPolicy p=new LocationPolicy();p.configure(config());double next=2000;
        StringBuilder trace=new StringBuilder("[");int sent=0;int firstAfterRestart=-1;
        for(int s=0;s<=360;s++) {
            double t=s*1000.0;if(t<next)continue;
            boolean moving=(s>=60&&s<150)||s>=240;
            double metres=(s<60?0:(s<150?s-60:(s<240?90:s-150)))*60/3.6;
            LocationPolicy.Fix f=new LocationPolicy.Fix(38+metres/111194.9266,-25,10,WALL+t,moving?60/3.6:0);
            assertTrue(p.observe(f,WALL+t,t));
            if(p.shouldSend(f,WALL+t,t,false)) {
                p.attempted(t);p.completed(f,t+1000,true);
                if(s>=240&&firstAfterRestart<0)firstAfterRestart=s;
                if(sent++>0)trace.append(',');
                trace.append("{\"id\":\"android\",\"t\":").append(s)
                    .append(",\"lat\":").append(f.latitude).append(",\"lon\":").append(f.longitude).append('}');
            }
            next=t+p.requestInterval(WALL+t);
        }
        assertTrue(firstAfterRestart>=240&&firstAfterRestart<=250);
        System.out.println("TRANSPORT_TRACE "+trace.append(']'));
    }
}
