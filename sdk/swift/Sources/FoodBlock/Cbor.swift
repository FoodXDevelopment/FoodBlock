import Foundation

/// The compact form (spec/modules/encoding.md): a signed public block as CBOR for small links. The rules run in the Rust
/// core; these calls turn bytes into the hex the door takes. The id of a decoded block is the hash of its canonical JSON,
/// never of these bytes. `short` uses the key table (protocol.json `cbor.keys`).
public enum Cbor {
    public static let mediaType = "application/foodblock+cbor"
    static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
    static func bytes(_ hex: String) -> Data {
        var out = Data(), i = hex.startIndex
        while i < hex.endIndex { let j = hex.index(i, offsetBy: 2); out.append(UInt8(hex[i..<j], radix: 16) ?? 0); i = j }
        return out
    }
    /// A signed public block as the CBOR message [t, block, signature].
    public static func encode(_ block: JSON, short: Bool = false) throws -> Data { bytes(try Core.string("cbor_encode", block, short)) }
    /// The block a CBOR message carries, its hash taken from its canonical JSON. Throws on floats, tags, null, indefinite lengths and duplicate keys.
    public static func decode(_ data: Data) throws -> JSON { try Core.json("cbor_decode", hex(data)) }
    public static func encodePush(_ blocks: [JSON], short: Bool = false) throws -> Data { bytes(try Core.string("cbor_encode_push", blocks, short)) }
    public static func decodePush(_ data: Data) throws -> [JSON] { (try Core.call("cbor_decode_push", [hex(data)]) as? [JSON]) ?? [] }
    public static func encodeHeader(_ header: JSON, short: Bool = false) throws -> Data { bytes(try Core.string("cbor_encode_header", header, short)) }
    public static func decodeHeader(_ data: Data) throws -> JSON { try Core.json("cbor_decode_header", hex(data)) }
}
