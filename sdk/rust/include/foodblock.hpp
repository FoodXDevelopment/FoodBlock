// foodblock.hpp: header-only C++17 wrappers over the FoodBlock C ABI (foodblock.h): every call goes through fb_call, the one JSON door.
//
// std::string in, std::string out (JSON text). A failed call throws foodblock::Error, which carries the status code
// and the reason in plain words (for a refusal, `reasons()` is the JSON array of refusals, [{ code, detail }]). Every
// buffer the library returns is freed here, by RAII. Use any JSON library you like for building and reading the strings
// (nlohmann::json, RapidJSON, or plain text, as the example does).
//
// Public domain (CC0 1.0).
#ifndef FOODBLOCK_HPP
#define FOODBLOCK_HPP

#include "foodblock.h"

#include <memory>
#include <stdexcept>
#include <string>

namespace foodblock {

// A failed call: the status (FB_ERR_*, or kind_refused for a refusal) and the reason.
class Error : public std::runtime_error {
 public:
  static constexpr int kind_refused = 3;
  Error(int code, const std::string& what, const std::string& refusals = "[]")
      : std::runtime_error(what), code_(code), refusals_(refusals) {}
  int code() const noexcept { return code_; }
  bool refused() const noexcept { return code_ == kind_refused; }
  // For a refusal, the JSON array of refusals: [{ code, detail }], codes from protocol.json refusals.codes.
  std::string reasons() const { return refused() ? refusals_ : std::string("[]"); }

 private:
  int code_;
  std::string refusals_;
};

namespace detail {
struct Free {
  void operator()(char* p) const noexcept { fb_free(p); }
};
using Owned = std::unique_ptr<char, Free>;

// The text of a JSON string value ("..." with escapes) read from `at`; `end` is set past its closing quote.
inline std::string unquote(const std::string& j, size_t at, size_t* end = nullptr) {
  std::string out;
  size_t i = at + 1;
  for (; i < j.size() && j[i] != '"'; ++i) {
    if (j[i] != '\\') { out += j[i]; continue; }
    char c = j[++i];
    if (c == 'n') out += '\n'; else if (c == 't') out += '\t'; else if (c == 'r') out += '\r';
    else if (c == 'u') { out += static_cast<char>(std::stoi(j.substr(i + 1, 4), nullptr, 16)); i += 4; }
    else out += c;
  }
  if (end) *end = i + 1;
  return out;
}

// The one call: the door (fb_call) answers {"ok": value} or {"error": kind, "message", "refusals", ...}; the value comes back as
// JSON text (a string value unquoted), an error is thrown.
inline std::string door(const std::string& op, const std::string& args) {
  char* raw = nullptr;
  int status = fb_call(op.c_str(), args.c_str(), &raw);
  Owned out(raw);
  std::string answer = out ? std::string(out.get()) : std::string();
  if (status != FB_OK) throw Error(status, answer);
  if (answer.rfind("{\"ok\":", 0) == 0) {
    std::string value = answer.substr(6, answer.size() - 7);
    return !value.empty() && value[0] == '"' ? unquote(value, 0) : value;
  }
  auto member = [&](const char* key) { return answer.find(std::string("\"") + key + "\":"); };
  size_t m = member("message"), r = member("refusals"), k = member("error");
  std::string kind = k == std::string::npos ? "" : unquote(answer, k + 8);
  std::string message = m == std::string::npos ? answer : unquote(answer, m + 10);
  std::string refusals = r == std::string::npos ? "[]" : answer.substr(r + 11, answer.size() - r - 12);
  throw Error(kind == "refused" ? Error::kind_refused : kind == "internal" ? FB_ERR_INTERNAL : FB_ERR_ARGUMENT, message, refusals);
}
inline std::string text(const std::string& s) {  // JSON text of a string
  std::string out = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') out += '\\';
    out += c;
  }
  return out + "\"";
}
inline std::string opt(const std::string& s) { return s.empty() ? "null" : s; }
}  // namespace detail

inline std::string version() {
  char* raw = nullptr;
  int status = fb_version(&raw);
  detail::Owned out(raw);
  return status == FB_OK && out ? std::string(out.get()) : std::string();
}
// The canonical string of a block { type, state, refs }.
inline std::string canonical(const std::string& block) { return detail::door("canonical", "[" + block + "]"); }
// A block's id: SHA-256 of its canonical form, hex.
inline std::string hash(const std::string& block) { return detail::door("hash", "[" + block + "]"); }
// { public_key_sign, private_key } from a 32-byte seed (hex); an empty seed makes a new key.
inline std::string keypair(const std::string& seed_hex = "") {
  return detail::door("keypair", "[" + (seed_hex.empty() ? std::string("null") : detail::text(seed_hex)) + "]");
}
// A genesis, signed (keys: { public_key_sign, private_key }; options: { kind, at, audience, encryption_key, recovery_key, reach }: kind, at and audience are stated).
inline std::string genesis(const std::string& keys, const std::string& options) {
  return detail::door("genesis", "[" + keys + "," + options + "]");
}
inline std::string sign(const std::string& block, const std::string& private_key) {
  return detail::door("sign", "[" + block + "," + detail::text(private_key) + "]");
}
inline bool verify(const std::string& block, const std::string& signature, const std::string& public_key) {
  return detail::door("verify", "[" + block + "," + detail::text(signature) + "," + detail::text(public_key) + "]") == "true";
}
// The write check: a JSON array of reasons, "[]" when well-formed. held, schemas: JSON arrays of blocks, or "".
inline std::string check(const std::string& block, const std::string& held = "", const std::string& schemas = "") {
  return detail::door("check", "[" + block + "," + (held.empty() ? "[]" : held) + "," + detail::opt(schemas) + "]");
}
// Why every node refuses a block: [{ code, detail }], "[]" when well-formed. held, schemas as for check.
inline std::string refusals(const std::string& block, const std::string& held = "", const std::string& schemas = "") {
  return detail::door("refusals", "[" + block + "," + (held.empty() ? "[]" : held) + "," + detail::opt(schemas) + "]");
}
inline bool well_formed(const std::string& block, const std::string& held = "", const std::string& schemas = "") {
  return check(block, held, schemas) == "[]";
}
// { seq, prev } after `last` (a block, or "" for none, then `brought_in` names the block that brought the key in).
inline std::string next_link(const std::string& last, const std::string& brought_in = "") {
  return detail::door("next_link", "[" + detail::opt(last) + "," + (brought_in.empty() ? "null" : detail::text(brought_in)) + "]");
}
// Compose, check, sign, chain. options states `audience` ("public" or recipients) and `at` (or `clockless`): nothing is filled in. Throws Error (refused() true, reasons() the refusals) when the write check refuses.
inline std::string write(const std::string& type, const std::string& state, const std::string& refs, const std::string& options) {
  return detail::door("write", "[" + detail::text(type) + "," + state + "," + refs + "," + options + "]");
}
// Encrypt a JSON value to a JSON array of X25519 public keys.
inline std::string seal(const std::string& value, const std::string& keys) { return detail::door("seal", "[" + value + "," + keys + "]"); }
inline std::string open(const std::string& envelope, const std::string& x25519_private) {
  return detail::door("open", "[" + envelope + "," + detail::text(x25519_private) + "]");
}

// An expected-style result, for code built without exceptions in the hot path: ok() and value(), or error().
struct Result {
  bool ok_ = false;
  std::string value_;
  int code_ = FB_OK;
  bool ok() const noexcept { return ok_; }
  const std::string& value() const noexcept { return value_; }
  const std::string& error() const noexcept { return value_; }
  int code() const noexcept { return code_; }
};
template <typename F>
Result attempt(F&& f) noexcept {
  try {
    return Result{true, f(), FB_OK};
  } catch (const Error& e) {
    return Result{false, e.what(), e.code()};
  } catch (const std::exception& e) {
    return Result{false, e.what(), FB_ERR_INTERNAL};
  }
}

}  // namespace foodblock

#endif  // FOODBLOCK_HPP
