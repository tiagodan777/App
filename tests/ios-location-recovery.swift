import Foundation

@main
struct LocationRecoveryTests {
  static var checks = 0

  static func expect(_ value: Bool, _ message: String) {
    checks += 1
    precondition(value, message)
  }

  static func expectBudget(_ message: String, _ block: () throws -> [TimeInterval]) {
    do {
      _ = try block()
      preconditionFailure(message)
    } catch LocationPushAccess.Failure.budget {
      checks += 1
    } catch {
      preconditionFailure("Unexpected error: \(error)")
    }
  }

  static func main() throws {
    let now: TimeInterval = 1_000_000
    // A clock correction previously made every later request fail until the
    // original wall clock time was reached, regardless of the three-minute cap.
    let corrected = try LocationPushAccess.normalizedAttempts(
      [now + 3600, now - 360, now - 90000], now: now
    )
    expect(corrected == [now - 360, now], "Clock rollback must preserve recent budget costs")
    expectBudget("Clock rollback must not grant an immediate free attempt") {
      try LocationPushAccess.nextAttempts(corrected, now: now)
    }
    let recovered = try LocationPushAccess.nextAttempts(corrected, now: now + 180)
    expect(recovered == corrected + [now + 180], "Automatic capture must recover after its normal interval")
    expectBudget("Manual tests must keep their five-minute interval") {
      try LocationPushAccess.nextAttempts(corrected, now: now + 180, manual: true)
    }
    expect(try LocationPushAccess.nextAttempts(corrected, now: now + 300, manual: true).count == 3,
      "Manual capture must recover after its own interval")

    let daily = try LocationPushAccess.normalizedAttempts(Array(repeating: now + 3600, count: 180), now: now)
    expectBudget("Clock rollback must preserve the daily cap") {
      try LocationPushAccess.nextAttempts(daily, now: now + 180)
    }
    expect(try LocationPushAccess.nextAttempts(daily, now: now + 86400) == [now + 86400],
      "Daily budget must become available after one day")
    expectBudget("Manual capture must keep its hourly cap") {
      try LocationPushAccess.nextAttempts([now - 1200, now - 900, now - 600], now: now, manual: true)
    }
    expectBudget("Nonfinite stored values must fail closed") {
      try LocationPushAccess.normalizedAttempts([.infinity], now: now)
    }
    expectBudget("Nonfinite current clock must fail closed") {
      try LocationPushAccess.normalizedAttempts([], now: .nan)
    }
    expect(LocationPushAccess.validToken(String(repeating: "a1", count: 32)), "Valid token rejected")
    expect(!LocationPushAccess.validToken(String(repeating: "é", count: 32)), "Non-ASCII token accepted")
    print("iOS location recovery: \(checks) checks passed")
  }
}
