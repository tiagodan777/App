import CoreLocation
import Foundation
import Security

// These adapters are substituted only in the runner's temporary source copies.
// Production coordinator methods, policy decisions, token parsing, and upload
// response handling execute unchanged. Network tasks record data in memory.
enum TestClock {
  static var elapsedNow: Double = 100_000
  static var wall: Double?
}
final class TestUserDefaults {
  static let standard = TestUserDefaults()
  var values = [String: Any]()
  func object(forKey key: String) -> Any? { values[key] }
  func bool(forKey key: String) -> Bool { values[key] as? Bool ?? false }
  func dictionary(forKey key: String) -> [String: Any]? { values[key] as? [String: Any] }
  func set(_ value: Any?, forKey key: String) { values[key] = value }
  func removeObject(forKey key: String) { values.removeValue(forKey: key) }
}

protocol TestLocationManagerDelegate: AnyObject {}
enum TestAuthorizationStatus { case notDetermined, restricted, denied, authorizedAlways, authorizedWhenInUse }
final class TestLocationManager: NSObject {
  static var latest: TestLocationManager!
  static var servicesEnabled = true
  weak var delegate: TestLocationManagerDelegate?
  var authorizationStatus: TestAuthorizationStatus = .authorizedAlways
  var desiredAccuracy: CLLocationAccuracy = 0
  var distanceFilter: CLLocationDistance = 0
  var activityType: CLActivityType = .other
  var pausesLocationUpdatesAutomatically = false
  var showsBackgroundLocationIndicator = false
  var allowsBackgroundLocationUpdates = false
  var location: CLLocation?
  var updating = false
  var visits = false
  var significant = false
  var starts = 0
  override init() { super.init(); Self.latest = self }
  static func locationServicesEnabled() -> Bool { servicesEnabled }
  static func significantLocationChangeMonitoringAvailable() -> Bool { true }
  func startUpdatingLocation() { updating = true; starts += 1 }
  func stopUpdatingLocation() { updating = false }
  func startMonitoringVisits() { visits = true }
  func stopMonitoringVisits() { visits = false }
  func startMonitoringSignificantLocationChanges() { significant = true }
  func stopMonitoringSignificantLocationChanges() { significant = false }
}

struct TestBackgroundTaskIdentifier: Hashable {
  let rawValue: Int
  static let invalid = Self(rawValue: -1)
}
final class TestApplication {
  static let shared = TestApplication()
  enum State { case active, background }
  var applicationState = State.background
  static let protectedDataDidBecomeAvailableNotification = Notification.Name("TestProtectedDataAvailable")
  static let didBecomeActiveNotification = Notification.Name("TestDidBecomeActive")
  private var sequence = 0
  var active = Set<TestBackgroundTaskIdentifier>()
  func beginBackgroundTask(withName: String, expirationHandler: @escaping () -> Void) -> TestBackgroundTaskIdentifier {
    sequence += 1
    let id = TestBackgroundTaskIdentifier(rawValue: sequence)
    active.insert(id)
    return id
  }
  func endBackgroundTask(_ id: TestBackgroundTaskIdentifier) { active.remove(id) }
}

final class TestURLSessionConfiguration {
  static var `default`: TestURLSessionConfiguration { TestURLSessionConfiguration() }
  var timeoutIntervalForRequest: TimeInterval = 0
  var timeoutIntervalForResource: TimeInterval = 0
  var waitsForConnectivity = false
  var requestCachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy
}
final class TestURLSession {
  static var instances = [TestURLSession]()
  var tasks = [TestURLSessionDataTask]()
  var invalidated = false
  init(configuration: TestURLSessionConfiguration, delegate: Any?, delegateQueue: OperationQueue?) {
    Self.instances.append(self)
  }
  func dataTask(with request: URLRequest, completionHandler: @escaping (Data?, URLResponse?, Error?) -> Void) -> TestURLSessionDataTask {
    precondition(!invalidated, "A resumed coordinator attempted to reuse an invalidated session")
    let task = TestURLSessionDataTask(request: request, completion: completionHandler)
    tasks.append(task)
    return task
  }
  func invalidateAndCancel() {
    invalidated = true
    tasks.forEach { $0.cancel() }
  }
}
final class TestURLSessionDataTask {
  let request: URLRequest
  let completion: (Data?, URLResponse?, Error?) -> Void
  var resumed = false
  var canceled = false
  init(request: URLRequest, completion: @escaping (Data?, URLResponse?, Error?) -> Void) {
    self.request = request; self.completion = completion
  }
  func resume() { resumed = true }
  func cancel() { canceled = true }
  // Intentionally deliver completions even after cancellation, as URLSession can.
  func reply(status: Int = 200, accepted: Bool = true) {
    let data = try! JSONSerialization.data(withJSONObject: ["success": status == 200, "accepted": accepted])
    let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)
    completion(data, response, nil)
  }
}

enum TestKeychain {
  static let ownerA = String(repeating: "a", count: 64)
  static let ownerB = String(repeating: "b", count: 64)
  static var token: String? = ownerA
  static func copyMatching(_ query: CFDictionary, _ result: UnsafeMutablePointer<CFTypeRef?>?) -> OSStatus {
    guard let token else { return errSecItemNotFound }
    result?.pointee = Data(token.utf8) as CFData
    return errSecSuccess
  }
  @discardableResult static func delete(_ query: CFDictionary) -> OSStatus { token = nil; return errSecSuccess }
}

final class TestDispatchQueue {
  static let main = TestDispatchQueue()
  var immediate = [() -> Void]()
  var delayed = [DispatchWorkItem]()
  func async(_ block: @escaping () -> Void) { immediate.append(block) }
  func asyncAfter(deadline: DispatchTime, execute work: DispatchWorkItem) { delayed.append(work) }
  func drain() {
    while !immediate.isEmpty {
      let batch = immediate; immediate = []
      batch.forEach { $0() }
    }
  }
  func fireTimers() {
    let batch = delayed; delayed = []
    batch.forEach { $0.perform() }
    drain()
  }
}

final class MargotLocationPushProbe {
  static let shared = MargotLocationPushProbe()
  func refreshIfNeeded() {}
  func sync(visible: Bool, token: String?) {}
}

@main
struct LocationRelaunchTests {
  static var checks = 0
  static let visibleKey = "margot.background-location.visible"
  static let suspendedKey = "margot.background-location.server-suspended"
  static let pendingKey = "margot.background-location.pending"
  static let memberKey = "margot.background-location.member-id"

  static func expect(_ value: @autoclosure () -> Bool, _ message: String) {
    checks += 1
    guard value() else {
      fputs("FAIL: \(message)\n", stderr)
      exit(1)
    }
  }
  static func value<T>(_ name: String, in coordinator: LocationRelaunchCoordinator, as type: T.Type) -> T? {
    Mirror(reflecting: coordinator).children.first(where: { $0.label == name })?.value as? T
  }
  static func fix(age: TimeInterval = 0, latitude: Double = 38) -> CLLocation {
    CLLocation(coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: -27),
      altitude: 0, horizontalAccuracy: 10, verticalAccuracy: -1,
      timestamp: Date().addingTimeInterval(-age))
  }
  static func reset() {
    TestDispatchQueue.main.immediate = []; TestDispatchQueue.main.delayed = []
    TestURLSession.instances = []; TestApplication.shared.active = []
    TestLocationManager.servicesEnabled = true
    TestKeychain.token = TestKeychain.ownerA
    TestClock.elapsedNow = 100_000
    TestUserDefaults.standard.values = [visibleKey: true]
  }
  static func started() -> (LocationRelaunchCoordinator, TestLocationManager) {
    reset()
    let coordinator = LocationRelaunchCoordinator()
    let manager = TestLocationManager.latest!
    coordinator.start()
    expect(manager.updating, "Authorized startup should collect")
    return (coordinator, manager)
  }
  static func sendFix(_ coordinator: LocationRelaunchCoordinator, _ manager: TestLocationManager, latitude: Double = 38) {
    coordinator.locationManager(manager, didUpdateLocations: [fix(latitude: latitude)])
  }
  static func deny(_ coordinator: LocationRelaunchCoordinator, _ manager: TestLocationManager) {
    manager.authorizationStatus = .denied
    coordinator.locationManager(manager, didFailWithError: CLError(.denied))
  }

  static func testDenialResumesAndRejectsOldCompletion() {
    let (coordinator, manager) = started()
    sendFix(coordinator, manager)
    let session = TestURLSession.instances.last!
    let oldTask = session.tasks.last!
    expect(oldTask.resumed, "Initial upload should start")
    let oldLocation = fix()
    manager.location = oldLocation
    deny(coordinator, manager)
    expect(!manager.updating && !manager.visits && !manager.significant, "Denial must stop every sensor")
    expect(oldTask.canceled, "Denial must cancel the in-flight upload")
    expect(!session.invalidated, "Temporary denial must retain a usable session")
    expect(TestApplication.shared.active.isEmpty, "Pause must release its background task")
    expect(TestUserDefaults.standard.object(forKey: pendingKey) == nil, "Pause must discard persisted pending coordinates")
    sendFix(coordinator, manager)
    expect(session.tasks.count == 1, "Queued locations cannot upload while denied")

    manager.authorizationStatus = .authorizedAlways
    TestClock.elapsedNow += 6_000
    coordinator.locationManagerDidChangeAuthorization(manager)
    expect(manager.updating && manager.visits && manager.significant, "Restored Always must restart the same manager")
    expect(session.tasks.count == 1, "Restoring permission must not upload a pre-pause cached sample")
    coordinator.locationManager(manager, didUpdateLocations: [oldLocation])
    expect(session.tasks.count == 1, "Delayed pre-resume samples must remain rejected")
    sendFix(coordinator, manager, latitude: 38.001)
    expect(session.tasks.count == 2 && TestURLSession.instances.count == 1, "Resume must reuse the session and upload a fresh sample")
    let newTask = session.tasks.last!
    oldTask.reply(status: 401)
    TestDispatchQueue.main.drain()
    expect(TestKeychain.token == TestKeychain.ownerA, "Canceled old 401 must not delete the current credential")
    expect(value("sending", in: coordinator, as: Bool.self) == true, "Old completion must not clear resumed upload state")
    expect(!newTask.canceled && !session.invalidated, "Old completion must not stop resumed work")
    expect(TestApplication.shared.active.count == 1, "Old completion must not end the resumed background task")
    newTask.reply()
    TestDispatchQueue.main.drain()
    expect(value("sending", in: coordinator, as: Bool.self) == false, "Resumed upload should finish normally")
    expect(TestUserDefaults.standard.object(forKey: pendingKey) == nil, "Successful resumed upload clears its persisted sample")
    coordinator.stop()
  }

  static func testPendingRetryCannotEscapePause() {
    let (coordinator, manager) = started()
    sendFix(coordinator, manager)
    let session = TestURLSession.instances.last!
    session.tasks.last!.reply(status: 503)
    TestDispatchQueue.main.drain()
    expect(!TestDispatchQueue.main.delayed.isEmpty, "Failed upload must schedule a retry for this test")
    deny(coordinator, manager)
    expect(TestDispatchQueue.main.delayed.allSatisfy(\.isCancelled), "Pause must cancel every pending retry")
    TestClock.elapsedNow += 60_000
    TestDispatchQueue.main.fireTimers()
    expect(session.tasks.count == 1, "Canceled retry must not send while paused")
    coordinator.stop()
  }

  static func testResumeGates() {
    let gates: [(String, (TestLocationManager) -> Void)] = [
      ("global services", { _ in TestLocationManager.servicesEnabled = false }),
      ("WhenInUse", { $0.authorizationStatus = .authorizedWhenInUse }),
      ("visibility", { _ in TestUserDefaults.standard.set(false, forKey: visibleKey) }),
      ("server suspension", { _ in TestUserDefaults.standard.set(true, forKey: suspendedKey) }),
      ("missing token", { _ in TestKeychain.token = nil })
    ]
    for (name, apply) in gates {
      let (coordinator, manager) = started()
      deny(coordinator, manager)
      manager.authorizationStatus = .authorizedAlways
      apply(manager)
      coordinator.locationManagerDidChangeAuthorization(manager)
      coordinator.start()
      sendFix(coordinator, manager)
      expect(!manager.updating, "Resume must respect \(name)")
      expect(TestURLSession.instances.flatMap(\.tasks).isEmpty, "No upload is allowed without \(name)")
      coordinator.stop()
    }
  }

  static func testServicesRestorationAndTerminalHandoff() {
    let (coordinator, manager) = started()
    TestLocationManager.servicesEnabled = false
    coordinator.locationManager(manager, didFailWithError: CLError(.denied))
    expect(!manager.updating, "Global services failure must pause collection")
    TestLocationManager.servicesEnabled = true
    coordinator.locationManagerDidChangeAuthorization(manager)
    expect(manager.updating, "Restoring services with Always must resume collection")
    sendFix(coordinator, manager)
    let session = TestURLSession.instances.last!
    let task = session.tasks.last!
    coordinator.stop(preserveWakeMonitoring: true)
    expect(!manager.updating && manager.visits && manager.significant, "Plugin handoff must preserve wake monitoring")
    expect(session.invalidated && task.canceled, "Terminal stop must invalidate networking")
    let starts = manager.starts
    coordinator.start()
    coordinator.locationManagerDidChangeAuthorization(manager)
    sendFix(coordinator, manager)
    task.reply(status: 401)
    TestDispatchQueue.main.drain()
    expect(manager.starts == starts && !manager.updating, "Terminal handoff must remain irreversible")
    expect(TestKeychain.token == TestKeychain.ownerA, "Completion after terminal handoff must not delete the owner's token")
  }

  static func testTokenUnavailableOrChangedDuringCompletion() {
    for replacement in [Optional<String>.none, TestKeychain.ownerB] {
      let (coordinator, manager) = started()
      sendFix(coordinator, manager)
      let session = TestURLSession.instances.last!
      let oldTask = session.tasks.last!
      TestKeychain.token = replacement
      oldTask.reply(status: 401)
      TestDispatchQueue.main.drain()
      expect(TestKeychain.token == replacement, "An unconfirmed old token response must not delete the current credential")
      expect(value("sending", in: coordinator, as: Bool.self) == false, "Unconfirmed token response must release sending state")
      expect(TestApplication.shared.active.isEmpty, "Unconfirmed token response must release the background task")
      expect(manager.updating && !session.invalidated, "Temporary Keychain failure must not terminally stop recovery")
      if replacement == nil { TestKeychain.token = TestKeychain.ownerA }
      TestClock.elapsedNow += 6_000
      sendFix(coordinator, manager, latitude: 38.002)
      expect(session.tasks.count == 2, "A fresh sample must upload when the current credential becomes available")
      expect(session.tasks.last!.request.value(forHTTPHeaderField: "Authorization") == "Bearer \(TestKeychain.token!)",
        "Resumed upload must authenticate only as the current owner")
      coordinator.stop()
    }
  }

  static func testStationaryAcquisition() {
    for exit in ["walk", "train", "foreground", "handoff", "denied"] {
      let (coordinator, manager) = started()
      let base = Date().timeIntervalSince1970 * 1000
      TestApplication.shared.applicationState = .background
      func receive(_ seconds: Int, _ metres: Double = 0, _ speed: Double = 0, _ accuracy: Double = 10) {
        TestClock.elapsedNow = Double(seconds) * 1000
        TestClock.wall = base + TestClock.elapsedNow
        let location = CLLocation(coordinate: .init(latitude: 38 + metres/111195, longitude: -27),
          altitude: 0, horizontalAccuracy: accuracy, verticalAccuracy: -1, course: -1, speed: speed,
          timestamp: Date(timeIntervalSince1970: TestClock.wall! / 1000))
        coordinator.locationManager(manager, didUpdateLocations: [location])
        TestDispatchQueue.main.drain()
      }
      for t in stride(from: 0, through: 150, by: 30) { receive(t) }
      expect(manager.desiredAccuracy == kCLLocationAccuracyNearestTenMeters, "Early rest stays precise")
      receive(181)
      expect(manager.desiredAccuracy == kCLLocationAccuracyHundredMeters && manager.distanceFilter == 30,
        "Stable background readings lower actual sensor effort")
      expect(manager.updating && manager.significant && manager.visits, "Movement wake services remain armed")
      TestClock.wall = base + 361_000
      TestDispatchQueue.main.fireTimers()
      expect(manager.desiredAccuracy == kCLLocationAccuracyNearestTenMeters, "A stale heartbeat briefly checks precision")
      if exit == "walk" {
        // No fix during the precise check: the timeout must still release high accuracy.
        TestDispatchQueue.main.fireTimers()
      } else { receive(362) }
      expect(manager.desiredAccuracy == kCLLocationAccuracyHundredMeters, "Precision check is bounded")
      switch exit {
      case "walk": receive(370, 65, -1, 25)
      case "train": receive(370, 10, 20, 35)
      case "foreground":
        TestApplication.shared.applicationState = .active
        receive(370)
      case "denied": deny(coordinator, manager)
      default: coordinator.stop(preserveWakeMonitoring: true)
      }
      TestDispatchQueue.main.fireTimers()
      expect(manager.desiredAccuracy == kCLLocationAccuracyNearestTenMeters
        && manager.distanceFilter == kCLDistanceFilterNone, "Leave rest on " + exit)
      if exit == "denied" || exit == "handoff" { expect(!manager.updating, "No restart after " + exit) }
      coordinator.stop()
      TestClock.wall = nil
      TestApplication.shared.applicationState = .background
    }
  }

  static func main() {
    testStationaryAcquisition()
    testDenialResumesAndRejectsOldCompletion()
    testPendingRetryCannotEscapePause()
    testResumeGates()
    testServicesRestorationAndTerminalHandoff()
    testTokenUnavailableOrChangedDuringCompletion()
    print("iOS coordinator pause/resume: \(checks) behavioral checks passed (fake platform adapters; no network)")
  }
}
