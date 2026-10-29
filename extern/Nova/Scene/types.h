#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace nova {
constexpr size_t vertex_capacity = 262144;
struct Vertex { float position[4]; float color[4]; };
struct Uniform { float transform[16]; };
constexpr size_t key_capacity = 128;
struct KeyEvent { uint32_t scancode = 0, down = 0, modifiers = 0; };
struct Events {
    uint32_t width = 0, height = 0;
    float orbit_x = 0, orbit_y = 0, zoom = 0;
    bool close = false, minimized = false;
    bool focused = false, input_reset = false;
    uint32_t key_count = 0;
    std::array<KeyEvent, key_capacity> keys{};
};
struct Pipeline {
    std::span<const uint32_t> vertex;
    std::span<const uint32_t> fragment;
};
static_assert(sizeof(Vertex) == 32);
static_assert(sizeof(Uniform) == 64);
}
