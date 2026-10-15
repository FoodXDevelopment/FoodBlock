// A fridge sensor, as a micro peer: it has its own identity, signs each reading as an observe in its own chain, and
// checks every block before it sends it. Build and run: see README.md (or examples/cpp/CMakeLists.txt).
#include "foodblock.hpp"

#include <iostream>
#include <string>

// The example reads two fields from the JSON the library returns. A real device would use any JSON library.
static std::string field(const std::string& json, const std::string& key) {
  const std::string tag = "\"" + key + "\":\"";
  auto at = json.find(tag);
  if (at == std::string::npos) return "";
  at += tag.size();
  return json.substr(at, json.find('"', at) - at);
}

int main() {
  try {
    // Fixed seeds so the run is the same every time. A real device makes its key once, on the device: keypair().
    const std::string keys = foodblock::keypair("5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e");
    const std::string recovery = foodblock::keypair("7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e7e");
    const std::string public_key = field(keys, "public_key_sign");

    // Who the sensor is: its genesis. Its hash is the sensor's id.
    const std::string me = foodblock::genesis(keys, R"({"kind":"sensor","at":"2026-10-15T09:00:00.000Z",)"
        R"("encryption_key":"0f101bc98e786e795207789cf2e203f0cad2c7cc97a96fb7c3a9b458e8fe4729",)"
        R"("recovery_key":")" + field(recovery, "public_key_sign") + R"(","reach":"P30D"})");
    const std::string id = field(me, "hash");
    std::cout << "sensor id      " << id << "\n";

    // A reading: 3.9 degrees Celsius, as a decimal string (signed content holds no floats). write() composes it,
    // runs the write check, signs it, and puts it at seq 1 in the sensor's own chain.
    const std::string options = R"({"author":")" + id + R"(","key":)" + keys + R"(,"held":[)" + me +
                                R"(],"at":"2026-10-15T09:01:00.000Z"})";
    const std::string reading = foodblock::write("observe", R"({"kind":"reading","amount":{"value":"3.9","unit":"Cel"}})",
                                                 R"({"subject":")" + id + R"("})", options);
    std::cout << "reading        " << reading << "\n";

    // Anyone can check it: the hash is recomputed from the content, the signature against the sensor's key.
    std::cout << "hash matches   " << (foodblock::hash(reading) == field(reading, "hash") ? "yes" : "NO") << "\n";
    std::cout << "signature      " << (foodblock::verify(reading, field(reading, "signature"), public_key) ? "valid" : "INVALID") << "\n";
    std::cout << "write check    " << foodblock::check(reading) << "\n";
    std::cout << "next link      " << foodblock::next_link(reading) << "\n";

    // The write check refuses, never repairs: a float is not signed content.
    try {
      foodblock::write("observe", R"({"kind":"reading","temperature":3.9})", "{}", options);
      std::cout << "refused        NO (a float was written)\n";
      return 1;
    } catch (const foodblock::Error& e) {
      std::cout << "refused        " << (e.refused() ? e.reasons() : e.what()) << "\n";
    }
    return foodblock::well_formed(reading) ? 0 : 1;
  } catch (const foodblock::Error& e) {
    std::cerr << "foodblock error " << e.code() << ": " << e.what() << "\n";
    return 1;
  }
}
