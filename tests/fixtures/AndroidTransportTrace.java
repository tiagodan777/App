package com.margot.app;

import java.util.*;

/** Production policies; synthetic independent providers, network and clock, not physical phones. */
public final class AndroidTransportTrace {
    static final double WALL=1_800_000_000_000.0;
    static Map<String,Double> config() {
        Map<String,Double> c=new HashMap<>();c.put("moving_send_seconds",60.0);c.put("stationary_send_seconds",180.0);
        c.put("minimum_send_seconds",5.0);c.put("movement_metres",20.0);c.put("stationary_after_seconds",120.0);
        c.put("android_request_seconds",30.0);c.put("transport_alignment_version",1.0);return c;
    }
    static String run(String id,int phase,String shape,int kmh,int timing,boolean optimized) {
        LocationPolicy p=new LocationPolicy();p.configure(config());TransportPhasePolicy sync=new TransportPhasePolicy();
        double t=phase,interval=30000;int captures=0,sent=0;StringBuilder rows=new StringBuilder("[");
        double v=kmh/3.6;int duration=shape.equals("straight")?3600:600;
        for(;t<duration*1000;) {
            double s=t/1000;boolean quiet=shape.equals("journey")&&(s<60||(s>=180&&s<300));
            boolean suspended=shape.equals("power")&&s>=180&&s<300;
            if(suspended){t=300000+phase;sync.recovered();interval=30000;continue;}
            double travel=shape.equals("journey")?(s<60?0:(s<180?s-60:(s<300?120:s-180))):s;
            double x=travel*v,y=0,speed=quiet?0:v;
            if(shape.equals("curve")){x=200*Math.sin(travel*v/200);y=200*(1-Math.cos(travel*v/200));}
            if(shape.equals("turn")&&s>=180){x=180*v;y=(s-180)*v;}
            if(shape.equals("exit")&&id.equals("b")&&s>=180&&s<300){x=180*v;speed=0;}
            // Real separate-vehicle control, not a stale-coordinate offset.
            x+=id.equals("b")?(shape.equals("separate")?250:10):0;
            double callbackDelay=100;
            LocationPolicy.Fix f=new LocationPolicy.Fix(38+y/111194.9266,-25+x/(111194.9266*Math.cos(Math.toRadians(38))),10,WALL+t,speed);
            captures++;if(!p.observe(f,WALL+t+callbackDelay,t+callbackDelay))throw new AssertionError("valid sample rejected");
            sync.observe(f,WALL+t+callbackDelay,t+callbackDelay,optimized);
            if(sync.permitsUpload(f,p.lastSent)&&p.shouldSend(f,WALL+t+callbackDelay,t+callbackDelay,sync.forceUpload())) {
                boolean ok=!(shape.equals("network")&&s>=180&&s<300);
                p.attempted(t+callbackDelay);p.completed(f,t+1000,ok);
                if(ok){sync.acknowledged(f);if(sent++>0)rows.append(',');
                    rows.append("{\"id\":\"").append(id).append("\",\"t\":").append(s)
                    .append(",\"sent\":").append(s+callbackDelay/1000).append(",\"lat\":").append(f.latitude).append(",\"lon\":").append(f.longitude).append('}');}
            }
            double desired=sync.active?sync.requestMs:p.androidRequestMs;
            if(desired<30000)throw new AssertionError("GPS request exceeds baseline frequency");
            double next=t+(desired==interval?0:callbackDelay)+desired+(desired!=interval?500:0);
            if(timing>0) {
                double sensorPhase=id.equals("b")?350:0;
                next=Math.ceil((next-sensorPhase)/1000)*1000+sensorPhase;
            }
            interval=desired;t=next;
        }
        return "{\"captures\":"+captures+",\"attempts\":"+p.attempts+",\"uploads\":"+sent
            +",\"adjustments\":"+sync.adjustments+",\"misses\":"+sync.misses+",\"trace\":"+rows.append(']')+"}";
    }
    public static void main(String[] args) {
        StringBuilder json=new StringBuilder("[");int n=0;
        for(String shape:new String[]{"straight","curve","turn","journey","exit","network","power","separate"})
        for(int kmh:new int[]{30,60,100})for(int phase:new int[]{2,17,29})for(int timing=0;timing<2;timing++) {
            if(n++>0)json.append(',');json.append("{\"shape\":\"").append(shape).append("\",\"kmh\":").append(kmh)
                .append(",\"phase\":").append(phase).append(",\"timing\":").append(timing);
            for(boolean opt:new boolean[]{false,true})for(String id:new String[]{"a","b"})
                json.append(",\"").append(opt?"optimized_":"baseline_").append(id).append("\":")
                    .append(run(id,(id.equals("a")?2:phase)*1000,shape,kmh,timing,opt));
            json.append('}');
        }
        System.out.println(json.append(']'));
    }
}
