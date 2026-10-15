# Builds the sensor example against the Rust staticlib. From sdk/rust:
#   cargo rustc --release --features ffi --crate-type staticlib
#   cmake -S examples/cpp -B target/cpp && cmake --build target/cpp && ./target/cpp/sensor
cmake_minimum_required(VERSION 3.16)
project(foodblock_sensor CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(FOODBLOCK_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../..)
add_library(foodblock STATIC IMPORTED)
set_target_properties(foodblock PROPERTIES
  IMPORTED_LOCATION ${FOODBLOCK_ROOT}/target/release/libfoodblock.a
  INTERFACE_INCLUDE_DIRECTORIES ${FOODBLOCK_ROOT}/include)
if(APPLE)
  set_property(TARGET foodblock PROPERTY INTERFACE_LINK_LIBRARIES "-framework Security" "-framework CoreFoundation")
elseif(UNIX)
  set_property(TARGET foodblock PROPERTY INTERFACE_LINK_LIBRARIES pthread dl m)
endif()

add_executable(sensor sensor.cpp)
target_link_libraries(sensor PRIVATE foodblock)
