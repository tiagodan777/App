import Foundation
import Security

enum LocationPushAccess {
  struct Grant: Codable, Equatable {
    let id: String
    let token: String
    let expiresAt: TimeInterval
  }

  enum Failure: Error { case configuration, keychain(OSStatus), budget }
  private static let service = "com.margot.location-push-test"

  static func validToken(_ token: String) -> Bool {
    token.utf8.count == 64 && token.utf8.allSatisfy {
      (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0)
    }
  }

  private static func query(_ account: String) throws -> [String: Any] {
    guard let group = Bundle.main.object(
      forInfoDictionaryKey: "MargotLocationPushKeychainGroup"
    ) as? String, group.hasSuffix(".com.margot.locationpush"), !group.contains("$") else {
      throw Failure.configuration
    }
    return [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group]
  }

  private static func read<T: Decodable>(_ account: String) throws -> T? {
    var q = try query(account)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw Failure.keychain(status)
    }
    return try JSONDecoder().decode(T.self, from: data)
  }

  private static func write<T: Encodable>(_ value: T, account: String) throws {
    var q = try query(account)
    let attributes: [String: Any] = [
      kSecValueData as String: try JSONEncoder().encode(value),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    ]
    var status = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      q.merge(attributes) { _, new in new }
      status = SecItemAdd(q as CFDictionary, nil)
    }
    guard status == errSecSuccess else { throw Failure.keychain(status) }
  }

  static func grant(now: TimeInterval = Date().timeIntervalSince1970) throws -> Grant? {
    guard let value: Grant = try read("grant"), validToken(value.token),
      UUID(uuidString: value.id) != nil, value.expiresAt.isFinite,
      value.expiresAt > now, value.expiresAt <= now + 3605 else { return nil }
    return value
  }

  static func allow(token: String, until: TimeInterval) throws {
    let old = try grant()
    let id = old.flatMap { $0.token == token ? $0.id : nil } ?? UUID().uuidString
    let value = Grant(id: id,
      token: token, expiresAt: until)
    if old != value { try write(value, account: "grant") }
  }

  static func revoke() throws {
    let status = SecItemDelete(try query("grant") as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw Failure.keychain(status)
    }
  }

  static func stillAllowed(_ original: Grant) -> Bool {
    guard let current = try? grant() else { return false }
    return current.id == original.id && current.token == original.token
  }

  // Reserva antes de ligar o GPS. Sobrevive ao fim do processo e a novos Run.
  // Chamado apenas pela extensão, na main queue, incluindo entre instâncias.
  static func reserveAttempt(now: TimeInterval = Date().timeIntervalSince1970) throws {
    let history: [TimeInterval] = try read("attempts") ?? []
    try write(nextAttempts(history, now: now), account: "attempts")
  }

  static func nextAttempts(_ history: [TimeInterval], now: TimeInterval) throws -> [TimeInterval] {
    guard now.isFinite, history.allSatisfy({ $0.isFinite && $0 <= now }) else {
      throw Failure.budget
    }
    let recent = history.filter { now - $0 < 3600 }.sorted()
    guard recent.count < 3, recent.last.map({ now - $0 >= 300 }) ?? true else {
      throw Failure.budget
    }
    return recent + [now]
  }
}