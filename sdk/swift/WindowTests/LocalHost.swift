import Foundation
import XCTest
import FoodBlock
@testable import FoodBlockWindow

/// A real FoodOS host (the Node kernel in the Backend checkout) on a local port, for the end-to-end tests. Skips when there is no checkout or no node.
final class LocalHost {
    let process = Process(), input = Pipe(), output = Pipe()
    var url: URL!
    init(args: [String] = []) throws {
        let backend = ProcessInfo.processInfo.environment["FOODOS_BACKEND"] ?? NSHomeDirectory() + "/Backend-foodx-computer"
        let script = backend + "/kernel/testing/helpers/serve-passkey-host.mjs"
        guard FileManager.default.fileExists(atPath: script) else { throw XCTSkip("no Backend checkout (set FOODOS_BACKEND)") }
        let node = ["/opt/homebrew/bin/node", "/usr/local/bin/node", NSHomeDirectory() + "/.nvm/versions/node/current/bin/node"].first { FileManager.default.isExecutableFile(atPath: $0) }
        guard let exe = node ?? (try? shell("command -v node"))?.nonEmpty else { throw XCTSkip("no node") }
        process.executableURL = URL(fileURLWithPath: exe); process.arguments = [script] + args
        process.standardInput = input; process.standardOutput = output; process.standardError = FileHandle.nullDevice
        try process.run()
        let line = output.fileHandleForReading.availableData
        guard let j = try? JSONSerialization.jsonObject(with: line) as? JSON, let u = j["url"] as? String else { process.terminate(); throw XCTSkip("the host did not start") }
        url = URL(string: u)
    }
    deinit { try? input.fileHandleForWriting.close(); if process.isRunning { process.terminate() } }  // init can throw XCTSkip before the process launched
}
private func shell(_ c: String) throws -> String {
    let p = Process(), o = Pipe(); p.executableURL = URL(fileURLWithPath: "/bin/zsh"); p.arguments = ["-lc", c]; p.standardOutput = o; try p.run(); p.waitUntilExit()
    return String(decoding: o.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
}
private extension String { var nonEmpty: String? { isEmpty ? nil : self } }

/// A transport that can lose the network, and can lie about what the host proposed.
final class SwitchableTransport: Transport {
    let inner: Transport
    var offline = false
    var tamper: ((String, JSON) -> JSON)?
    init(_ inner: Transport) { self.inner = inner }
    func send(_ method: String, _ path: String, body: JSON?, token: String?) async throws -> (status: Int, body: JSON) {
        if offline { throw WindowError.offline }
        let r = try await inner.send(method, path, body: body, token: token)
        return (r.status, tamper?(path, r.body) ?? r.body)
    }
}
