// foodblock.hpp: header-only C++17 wrappers over the FoodBlock 1.6 C ABI (foodblock.h).
//
// std::string in, std::string out (JSON text). A failed call throws foodblock::Error, which carries the status code
// and the reason in plain words (for a refusal, `reasons()` is the JSON array of refusals, [{ code, detail }]). Every
// buffer the library returns is freed here, by RAII. Use any JSON library you like for building and reading the strings
// (nlohmann::json, RapidJSON, or plain text, as the example does).
//
// MIT licence.
#ifndef FOODBLOCK_HPP
#define FOODBLOCK_HPP

#include "foodblock.h"

#include <memory>
#include <stdexcept>
#include <string>

namespace foodblock {

// A failed call: the status (FB_ERR_*) and the reason.
class Error : public std::runtime_error {
 public:
  Error(int code, const std::string& what) : std::runtime_error(what), code_(code) {}
  int code() const noexcept { return code_; }
  bool refused() const noexcept { return code_ == FB_ERR_REFUSED; }
  // For a refusal, the JSON array of refusals: [{ code, detail }], codes from protocol.json refusals.codes.
  std::string reasons() const { return refused() ? std::string(what()) : std::string("[]"); }

 private:
  int code_;
};

namespace detail {
struct Free {
  void operator()(char* p) const noexcept { fb_free(p); }
};
using Owned = std::unique_ptr<char, Free>;

// Run one C call; turn its status and buffer into a string or an Error.
template <typename Call>
std::string call(Call&& c) {
  char* raw = nullptr;
  int status = c(&raw);
  Owned out(raw);
  std::string text = out ? std::string(out.get()) : std::string();
  if (status != FB_OK) throw Error(status, text);
  return text;
}
inline const char* opt(const std::string& s) { return s.empty() ? nullptr : s.c_str(); }
}  // namespace detail

inline std::string version() {
  return detail::call([](char** o) { return fb_version(o); });
}
// The canonical string of { type, state, refs }.
inline std::string canonical(const std::string& block) {
  return detail::call([&](char** o) { return fb_canonical(block.c_str(), o); });
}
// A block's id: SHA-256 of its canonical form, hex.
inline std::string hash(const std::string& block) {
  return detail::call([&](char** o) { return fb_hash(block.c_str(), o); });
}
// { public_key_sign, private_key } from a 32-byte seed (hex); an empty seed makes a new key.
inline std::string keypair(const std::string& seed_hex = "") {
  return detail::call([&](char** o) { return fb_keypair(detail::opt(seed_hex), o); });
}
// A genesis, signed (keys: { public_key_sign, private_key }; options: { kind, at, encryption_key, recovery_key, reach }).
inline std::string genesis(const std::string& keys, const std::string& options) {
  return detail::call([&](char** o) { return fb_genesis(keys.c_str(), options.c_str(), o); });
}
inline std::string sign(const std::string& block, const std::string& private_key) {
  return detail::call([&](char** o) { return fb_sign(block.c_str(), private_key.c_str(), o); });
}
inline bool verify(const std::string& block, const std::string& signature, const std::string& public_key) {
  return detail::call([&](char** o) { return fb_verify(block.c_str(), signature.c_str(), public_key.c_str(), o); }) == "true";
}
// The write check: a JSON array of reasons, "[]" when well-formed. options: { held: [...], schemas: [...] } or "".
inline std::string check(const std::string& block, const std::string& options = "") {
  return detail::call([&](char** o) { return fb_check(block.c_str(), detail::opt(options), o); });
}
// Why every node refuses a block: [{ code, detail }], "[]" when well-formed. options as for check.
inline std::string refusals(const std::string& block, const std::string& options = "") {
  return detail::call([&](char** o) { return fb_refusals(block.c_str(), detail::opt(options), o); });
}
inline bool well_formed(const std::string& block, const std::string& options = "") { return check(block, options) == "[]"; }
// { seq, prev } after `last` (a block, or "" for none, then `brought_in` names the block that brought the key in).
inline std::string next_link(const std::string& last, const std::string& brought_in = "") {
  return detail::call([&](char** o) { return fb_next_link(detail::opt(last), detail::opt(brought_in), o); });
}
// Compose, check, sign, chain. Throws Error (refused() true, reasons() the refusals) when the write check refuses.
inline std::string write(const std::string& type, const std::string& state, const std::string& refs, const std::string& options) {
  return detail::call([&](char** o) { return fb_write(type.c_str(), state.c_str(), refs.c_str(), options.c_str(), o); });
}
// Encrypt a JSON value to a JSON array of X25519 public keys.
inline std::string seal(const std::string& value, const std::string& keys) {
  return detail::call([&](char** o) { return fb_seal(value.c_str(), keys.c_str(), o); });
}
inline std::string open(const std::string& envelope, const std::string& x25519_private) {
  return detail::call([&](char** o) { return fb_open(envelope.c_str(), x25519_private.c_str(), o); });
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
