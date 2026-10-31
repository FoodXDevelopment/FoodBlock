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
    public static func encode(_ block: JSON, short: Bool = false) throws -> Data { bytes(try Door.cborEncode(block, short)) }
    /// The block a CBOR message carries, its hash taken from its canonical JSON. Throws on floats, tags, null, indefinite lengths and duplicate keys.
    /// With `held` (the author's blocks) the id is taken in the suite of the key that signed it (core.md, section 2).
    public static func decode(_ data: Data, held: [JSON]? = nil) throws -> JSON {
        try Door.cborDecode(hex(data), held)
    }
    public static func encodePush(_ blocks: [JSON], short: Bool = false) throws -> Data { bytes(try Door.cborEncodePush(blocks, short)) }
    public static func decodePush(_ data: Data) throws -> [JSON] { try Door.cborDecodePush(hex(data)) }
    public static func encodeHeader(_ header: JSON, short: Bool = false) throws -> Data { bytes(try Door.cborEncodeHeader(header, short)) }
    public static func decodeHeader(_ data: Data) throws -> JSON { try Door.cborDecodeHeader(hex(data)) }
}
