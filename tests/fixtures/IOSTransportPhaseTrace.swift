import Foundation

// Unchanged production iOS policy, synthetic coordinates/network/clock.
@main struct IOSTransportPhaseTrace {
    static func main() throws {
        let wall=1_800_000_000_000.0
        var output=[[String:Any]]()
        for shape in ["straight","curve","turn","journey","exit","network","power","separate"] {
            for kmh in [30,60,100] {
                let p=LocationPolicy(), v=Double(kmh)/3.6
                precondition(p.configure(["moving_send_seconds":60,"stationary_send_seconds":180,
                    "minimum_send_seconds":5,"movement_metres":20,"stationary_after_seconds":120,
                    "android_request_seconds":30,"transport_alignment_version":1]))
                var trace=[[String:Any]]()
                for tick in 0..<(shape == "straight" ? 3600 : 600) {
                    let s=Double(tick)+0.5,t=s*1000
                    if shape == "power" && s>=180 && s<300 {continue}
                    let quiet=shape == "journey" && (s<60 || (s>=180 && s<300))
                    let travel=shape == "journey" ? (s<60 ? 0 : (s<180 ? s-60 : (s<300 ? 120 : s-180))) : s
                    var x=travel*v,y=0.0,speed=quiet ? 0 : v
                    if shape == "curve" {x=200*sin(travel*v/200);y=200*(1-cos(travel*v/200))}
                    if shape == "turn" && s>=180 {x=180*v;y=(s-180)*v}
                    if shape == "exit" && s>=180 && s<300 {x=180*v;speed=0}
                    x += shape == "separate" ? 250 : 10
                    let f=LocationPolicy.Fix(latitude:38+y/111194.9266,
                        longitude:-25+x/(111194.9266*cos(38*Double.pi/180)),accuracy:10,capturedAt:wall+t,speed:speed)
                    if p.observe(f,wall+t,t),p.shouldSend(f,wall+t,t) {
                        let accepted = !(shape == "network" && s>=180 && s<300)
                        p.attempted(t);p.completed(f,t+1000,success:accepted)
                        if accepted {trace.append(["id":"b","t":s,"sent":s,"lat":f.latitude,"lon":f.longitude])}
                    }
                }
                output.append(["shape":shape,"kmh":kmh,"trace":trace])
            }
        }
        print(String(data:try JSONSerialization.data(withJSONObject:output,options:[.sortedKeys]),encoding:.utf8)!)
    }
}
