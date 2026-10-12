import Foundation

/// Same policy and bounds as Android LocationPolicy. No platform side effects; milliseconds.
final class LocationPolicy {
  static let version = "native-battery-1"
  static let maxAgeMs: Double = 90_000
  static let maxAccuracy: Double = 100
  struct Fix {
    let latitude: Double, longitude: Double, accuracy: Double, capturedAt: Double, speed: Double
  }
  var movingSendMs: Double = 60_000, stationarySendMs: Double = 180_000, minimumSendMs: Double = 5_000
  var movementMetres: Double = 20, stationaryAfterMs: Double = 120_000, androidRequestMs: Double = 30_000
  private(set) var latest: Fix?, lastSent: Fix?
  private var anchor: Fix?, anchorAt: Double = 0, previousObservation = -Double.greatestFiniteMagnitude
  private var stableSamples = 0
  private(set) var stationary = false
  private(set) var received = 0, rejected = 0, attempts = 0, successes = 0, failures = 0
  private var lastSuccess = -Double.greatestFiniteMagnitude, lastAttempt = -Double.greatestFiniteMagnitude
  private var retryAt: Double = 0, consecutiveFailures = 0

  @discardableResult func configure(_ values: [String: Double]) -> Bool {
    let keys = ["moving_send_seconds", "stationary_send_seconds", "minimum_send_seconds",
      "movement_metres", "stationary_after_seconds", "android_request_seconds"]
    let low: [Double] = [15,60,5,10,60,10], high: [Double] = [60,240,30,25,300,30]
    guard values.count == 6 else { return false }
    var v = [Double]()
    for i in 0..<6 {
      guard let n = values[keys[i]], n.isFinite, n >= low[i], n <= high[i] else { return false }
      v.append(n)
    }
    guard v[2] <= v[0], v[1] >= v[0] else { return false }
    movingSendMs=v[0]*1000; stationarySendMs=v[1]*1000; minimumSendMs=v[2]*1000
    movementMetres=v[3]; stationaryAfterMs=v[4]*1000; androidRequestMs=v[5]*1000
    return true
  }
  static func usable(_ fix: Fix?, _ wallNow: Double) -> Bool {
    guard let f = fix else { return false }
    return f.latitude.isFinite && f.longitude.isFinite && f.accuracy.isFinite && f.capturedAt.isFinite
      && abs(f.latitude)<=90 && abs(f.longitude)<=180 && f.accuracy>0 && f.accuracy<=maxAccuracy
      && wallNow-f.capturedAt >= -5000 && wallNow-f.capturedAt <= maxAgeMs
  }
  @discardableResult func observe(_ fix: Fix, _ wallNow: Double, _ elapsedNow: Double) -> Bool {
    received += 1
    guard Self.usable(fix,wallNow), latest.map({ fix.capturedAt > $0.capturedAt }) ?? true else {
      rejected += 1; return false
    }
    if let last = latest, wallNow-last.capturedAt<60_000, last.accuracy<=25,
      fix.accuracy>50, Self.distance(last,fix)>50 { rejected += 1; return false }
    latest=fix
    let stable = fix.accuracy<=25 && (!fix.speed.isFinite || fix.speed<0.5)
    if !stable || anchor == nil || elapsedNow-previousObservation>60_000
      || anchor.map({ Self.distance($0,fix)>15 }) == true {
      anchor=fix; anchorAt=elapsedNow; stableSamples=0; stationary=false
    }
    stableSamples += 1; previousObservation=elapsedNow
    stationary=stable && stableSamples>=3 && elapsedNow-anchorAt>=stationaryAfterMs
    return true
  }
  func shouldSend(_ fix: Fix, _ wallNow: Double, _ elapsedNow: Double, force: Bool = false) -> Bool {
    guard Self.usable(fix,wallNow), elapsedNow>=retryAt, elapsedNow-lastAttempt>=5000 else { return false }
    guard let last = lastSent else { return true }
    guard fix.capturedAt>last.capturedAt, elapsedNow-lastSuccess>=minimumSendMs else { return false }
    return force || Self.distance(last,fix)>=movementMetres
      || elapsedNow-lastSuccess >= (stationary ? stationarySendMs : movingSendMs)
  }
  func attempted(_ now: Double) { attempts += 1; lastAttempt=now }
  func completed(_ fix: Fix, _ now: Double, success: Bool) {
    if success {
      successes += 1; lastSent=fix; lastSuccess=now; consecutiveFailures=0; retryAt=0
    } else {
      failures += 1; consecutiveFailures += 1
      retryAt=now+min(120_000,5000*pow(2,Double(min(5,consecutiveFailures-1))))
    }
  }
  func retryDelay(_ now: Double) -> Double { max(0,retryAt-now) }
  static func distance(_ a: Fix, _ b: Fix) -> Double {
    let p=(b.latitude-a.latitude)*Double.pi/180, l=(b.longitude-a.longitude)*Double.pi/180
    let h=pow(sin(p/2),2)+cos(a.latitude*Double.pi/180)*cos(b.latitude*Double.pi/180)*pow(sin(l/2),2)
    return 12_742_000*asin(sqrt(min(1,h)))
  }
}

#if canImport(CoreLocation)
import CoreLocation
extension LocationPolicy {
  static let preferencesKey = "margot.location.policy.v1"
  static func fix(_ l: CLLocation) -> Fix {
    Fix(latitude:l.coordinate.latitude, longitude:l.coordinate.longitude,
        accuracy:l.horizontalAccuracy, capturedAt:l.timestamp.timeIntervalSince1970*1000, speed:l.speed)
  }
  static var wallNow: Double { Date().timeIntervalSince1970*1000 }
  static var elapsedNow: Double { ProcessInfo.processInfo.systemUptime*1000 }
  func restore() {
    if let values=UserDefaults.standard.dictionary(forKey:Self.preferencesKey) as? [String:Double] {
      configure(values)
    }
  }
  var diagnostics: [String:Any] {
    var data: [String:Any] = ["policy_version":Self.version, "mode":stationary ? "stationary" : "moving_or_unknown",
     "locations_received":received, "locations_rejected":rejected,
     "upload_attempts":attempts, "upload_successes":successes, "upload_failures":failures,
     "stationary_send_seconds":stationarySendMs/1000, "moving_send_seconds":movingSendMs/1000]
    if let latest = latest { data["last_capture_age_seconds"] = max(0,(Self.wallNow-latest.capturedAt)/1000) }
    if let lastSent = lastSent { data["last_acknowledged_capture_ms"] = lastSent.capturedAt }
    return data
  }
}
#endif
