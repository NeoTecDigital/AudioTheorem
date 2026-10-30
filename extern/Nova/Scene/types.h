#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace nova {
constexpr size_t vertex_capacity = 262144;
struct Vertex { float position[4]; float color[4]; };
constexpr size_t stroke_capacity = 100000;
struct Stroke { float a[4]; float b[4]; float color[4]; };
struct Uniform { float transform[16]; float viewport[4]; };
struct Geometry { std::span<const Vertex> vertices; std::span<const Stroke> strokes; uint32_t hud_start; };
constexpr size_t pointer_capacity = 128;
struct PointerEvent { uint32_t kind = 0; float x = 0, y = 0, delta = 0; };
constexpr size_t key_capacity = 128;
struct KeyEvent { uint32_t scancode = 0, down = 0, modifiers = 0; };
struct Events {
    uint32_t width = 0, height = 0;
    float orbit_x = 0, orbit_y = 0, zoom = 0;
    bool close = false, minimized = false;
    bool focused = false, input_reset = false;
    uint32_t key_count = 0;
    std::array<KeyEvent, key_capacity> keys{};
    uint32_t pointer_count = 0;
    std::array<PointerEvent, pointer_capacity> pointers{};
};
struct Pipeline {
    std::span<const uint32_t> vertex;
    std::span<const uint32_t> fragment;
    std::span<const uint32_t> stroke_vertex;
    std::span<const uint32_t> stroke_fragment;
};
static_assert(sizeof(Vertex) == 32);
static_assert(sizeof(Uniform) == 80);
}
