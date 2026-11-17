import Foundation

// Synthetic fixes and acknowledgements; executes the production upload policy.
@main struct TransportPolicyTests {
  static let wall: Double = 1_800_000_000_000
  static var checks = 0
  static var config: [String:Double] = ["moving_send_seconds":60,"stationary_send_seconds":180,
    "minimum_send_seconds":5,"movement_metres":20,"stationary_after_seconds":120,
    "android_request_seconds":30,"transport_alignment_version":1]
  static func check(_ ok: Bool, _ message: String) { checks += 1; precondition(ok,message) }
  static func fix(_ t: Double, _ speed: Double = 60/3.6, _ accuracy: Double = 10) -> LocationPolicy.Fix {
    .init(latitude:38+t/1000*speed/111194.9266,longitude:-25,accuracy:accuracy,capturedAt:wall+t,speed:speed)
  }
  static func main() {
    var rows = [[String:Any]]()
    for kmh in [30,60,100] {
      for enabled in [false,true] {
        let p = LocationPolicy()
        if enabled { check(p.configure(config),"server opt-in") }
        for t in stride(from:0.0,through:3_600_000,by:1000) {
          let f=fix(t,Double(kmh)/3.6)
          check(p.observe(f,wall+t,t),"usable transport callback")
          if p.shouldSend(f,wall+t,t,force:true) { p.attempted(t);p.completed(f,t,success:true) }
        }
        check(p.successes == (enabled ? 361 : 721),"bounded upload count, including force")
        rows.append(["kmh":kmh,"alignment":enabled,"callbacks":3601,"uploads":p.successes])
      }
    }
    let p=LocationPolicy();check(p.configure(config),"configure")
    for t in stride(from:0.0,through:60_000,by:10_000) {
      let f=fix(t);check(p.observe(f,wall+t,t),"callback")
      check(p.shouldSend(f,wall+t,t),"one-second ACK must not double the cadence")
      p.attempted(t);p.completed(f,t+1000,success:true)
    }
    let stop=fix(65_000,0);p.observe(stop,wall+65_000,65_000)
    check(p.inTransport(stop,wall+65_000),"brief settling samples communicate the stop")
    let settled=fix(81_000,0);p.observe(settled,wall+81_000,81_000)
    check(!p.inTransport(settled,wall+81_000),"settling ends after 20 seconds")
    check(!p.inTransport(fix(66_000,-1),wall+66_000),"unknown speed does not enable batching")
    check(!p.inTransport(fix(66_000,20,60),wall+66_000),"poor accuracy does not enable batching")
    check(!p.inTransport(fix(66_000),wall+82_000),"stale speed does not enable batching")
    let failed=LocationPolicy();failed.configure(config)
    let f=fix(0);failed.observe(f,wall,0);failed.attempted(0);failed.completed(f,0,success:false)
    check(!failed.shouldSend(fix(4000),wall+4000,4000,force:true),"force respects network backoff")
    check(failed.shouldSend(fix(5000),wall+5000,5000),"newest capture can retry")
    check(!failed.shouldSend(f,wall+90_001,90_001,force:true),"outage never freshens old capture")
    check(failed.lastSent == nil,"network failure cannot acknowledge position")
    var disabled=config;disabled.removeValue(forKey:"transport_alignment_version")
    check(p.configure(disabled) && !p.transportAlignment,"old server policy disables transport")
    var invalid=config;invalid["transport_alignment_version"]=2
    check(!p.configure(invalid) && !p.transportAlignment,"invalid capability is atomic")
    let freshOwner=LocationPolicy();freshOwner.configure(config)
    check(freshOwner.latest == nil && freshOwner.lastSent == nil,"new owner has no position")
    let still=LocationPolicy();still.configure(config)
    for t in stride(from:0.0,through:3_600_000,by:30_000) {
      let f=fix(t,0);still.observe(f,wall+t,t)
      if still.shouldSend(f,wall+t,t) {still.attempted(t);still.completed(f,t,success:true)}
    }
    check(still.stationary && still.successes<=23,"stationary savings preserved")
    let journey=LocationPolicy();journey.configure(config);var trace=[[String:Any]]()
    for s in 0...360 {
      let moving = (s>=60 && s<150) || s>=240
      let metres=Double(s<60 ? 0 : (s<150 ? s-60 : (s<240 ? 90 : s-150)))*60/3.6
      let t=Double(s)*1000
      let f=LocationPolicy.Fix(latitude:38+metres/111194.9266,longitude:-25,accuracy:10,
        capturedAt:wall+t,speed:moving ? 60/3.6 : 0)
      journey.observe(f,wall+t,t)
      if journey.shouldSend(f,wall+t,t) {
        journey.attempted(t);journey.completed(f,t+1000,success:true)
        trace.append(["id":"ios","t":s,"lat":f.latitude,"lon":f.longitude])
      }
    }
    print(String(data:try! JSONSerialization.data(withJSONObject:["checks":checks,"scenarios":rows,"journey":trace,
      "stationary_uploads":still.successes,"simulated_only":true],options:[.prettyPrinted,.sortedKeys]),encoding:.utf8)!)
  }
}
