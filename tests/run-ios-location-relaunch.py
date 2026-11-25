#!/usr/bin/env python3
"""Run coordinator behavior on macOS with in-memory platform adapters.

The coordinator and upload policy are compiled from production source. Only
platform dependency names and the policy's elapsed clock are substituted in
temporary copies. No networking, device location, or real Keychain is used.
This does not emulate iOS scheduling or establish device-level recovery.
"""
from pathlib import Path
import argparse
import re
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--coordinator-source", type=Path,
                    default=ROOT / "ios/App/App/LocationRelaunchCoordinator.swift",
                    help="Optional previous coordinator source for regression verification")
arguments = parser.parse_args()
coordinator = arguments.coordinator_source.read_text()
policy = (ROOT / "ios/App/App/LocationPolicy.swift").read_text()

# UIKit is unavailable to a native macOS command-line executable. CoreLocation
# remains imported for real CLLocation values and error enums. The manager's
# authorization enum is fake because WhenInUse is unavailable on macOS.
coordinator = coordinator.replace("import UIKit\n", "")
adapters = {
    "CLLocationManager": "TestLocationManager",
    "CLLocationManagerDelegate": "TestLocationManagerDelegate",
    "URLSession": "TestURLSession",
    "URLSessionConfiguration": "TestURLSessionConfiguration",
    "URLSessionDataTask": "TestURLSessionDataTask",
    "UIApplication": "TestApplication",
    "UIBackgroundTaskIdentifier": "TestBackgroundTaskIdentifier",
    "DispatchQueue": "TestDispatchQueue",
    "UserDefaults": "TestUserDefaults",
    "SecItemCopyMatching": "TestKeychain.copyMatching",
    "SecItemDelete": "TestKeychain.delete",
}
for original, replacement in adapters.items():
    coordinator = re.sub(r"\b" + original + r"\b", replacement, coordinator)

clock = "static var elapsedNow: Double { ProcessInfo.processInfo.systemUptime*1000 }"
if policy.count(clock) != 1:
    raise SystemExit("Policy clock changed; review the explicit test adapter.")
policy = policy.replace(clock, "static var elapsedNow: Double { TestClock.elapsedNow }")
policy = policy.replace("static var wallNow: Double { Date().timeIntervalSince1970*1000 }",
                        "static var wallNow: Double { TestClock.wall ?? Date().timeIntervalSince1970*1000 }")
for dependency in ("UserDefaults", "CLLocationManager", "DispatchQueue"):
    policy = re.sub(r"\b" + dependency + r"\b", adapters[dependency], policy)

with tempfile.TemporaryDirectory(prefix="margot-relaunch-tests-") as temp:
    directory = Path(temp)
    coordinator_file = directory / "LocationRelaunchCoordinator.swift"
    policy_file = directory / "LocationPolicy.swift"
    coordinator_file.write_text(coordinator)
    policy_file.write_text(policy)
    executable = directory / "relaunch-tests"
    subprocess.run([
        "xcrun", "swiftc", "-module-cache-path", str(directory / "module-cache"),
        str(coordinator_file), str(policy_file),
        str(ROOT / "tests/ios-location-relaunch.swift"), "-o", str(executable),
    ], check=True)
    subprocess.run([str(executable)], check=True)
