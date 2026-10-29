#include "nova_visualizer.h"
#include "../extern/Nova/Nova.h"
#include "nova_shaders.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <exception>
#include <memory>
#include <stdexcept>

static_assert(sizeof(NovaVertex) == sizeof(nova::Vertex));
static_assert(offsetof(NovaUpload, transform) == 24);
static_assert(sizeof(NovaEvents) == 1584);
static_assert(sizeof(NovaKeyEvent) == 12);
static_assert(offsetof(NovaEvents, keys) == 48);
namespace {
int32_t failure(char* error, size_t capacity, const char* message) noexcept {
    if (error && capacity) {
        size_t count = std::min(capacity - 1, std::strlen(message));
        std::memcpy(error, message, count); error[count] = '\0';
    }
    return -1;
}
void validate(const NovaUpload* frame) {
    if (!frame || frame->version != NOVA_ABI_VERSION || frame->size != sizeof(NovaUpload))
        throw std::invalid_argument("Nova ABI version or upload size");
    if (frame->count > NOVA_VERTEX_CAPACITY || frame->stride != sizeof(NovaVertex))
        throw std::length_error("Nova vertex capacity or stride");
    if (frame->count % 3 || (frame->count && !frame->vertices))
        throw std::invalid_argument("Nova triangle vertices");
    for (float value : frame->transform)
        if (!std::isfinite(value)) throw std::invalid_argument("Nova nonfinite transform");
    for (uint32_t i = 0; i < frame->count; ++i) {
        const auto& vertex = frame->vertices[i];
        for (float value : vertex.position)
            if (!std::isfinite(value)) throw std::invalid_argument("Nova nonfinite vertex");
        for (float value : vertex.color)
            if (!std::isfinite(value)) throw std::invalid_argument("Nova nonfinite color");
    }
}
}
extern "C" int32_t nova_create(uint32_t width, uint32_t height, void** output, char* error, size_t capacity) {
    if (!output) return failure(error, capacity, "Nova null output handle");
    *output = nullptr;
    try {
        auto app = std::make_unique<Nova>(width, height, nova::Pipeline{nova_vertex_shader, nova_fragment_shader});
        *output = app.release(); return 0;
    } catch (const std::exception& e) { return failure(error, capacity, e.what()); }
    catch (...) { return failure(error, capacity, "Nova initialization exception"); }
}
extern "C" int32_t nova_poll(void* handle, NovaEvents* events, char* error, size_t capacity) {
    try {
        if (!handle || !events || events->version != NOVA_ABI_VERSION || events->size != sizeof(NovaEvents))
            throw std::invalid_argument("Nova invalid poll handle or ABI");
        auto out = static_cast<Nova*>(handle)->poll();
        events->width = out.width; events->height = out.height;
        events->close = out.close; events->minimized = out.minimized;
        events->orbit_x = out.orbit_x; events->orbit_y = out.orbit_y; events->zoom = out.zoom;
        events->focused = out.focused; events->input_reset = out.input_reset;
        events->key_count = out.key_count;
        for (uint32_t i = 0; i < out.key_count; ++i)
            events->keys[i] = {out.keys[i].scancode, out.keys[i].down, out.keys[i].modifiers};
        return 0;
    } catch (const std::exception& e) { return failure(error, capacity, e.what()); }
    catch (...) { return failure(error, capacity, "Nova poll exception"); }
}
extern "C" int32_t nova_validate_upload(const NovaUpload* upload, char* error, size_t capacity) {
    try { validate(upload); return 0; }
    catch (const std::exception& e) { return failure(error, capacity, e.what()); }
    catch (...) { return failure(error, capacity, "Nova validation exception"); }
}
extern "C" int32_t nova_draw(void* handle, const NovaUpload* upload, char* error, size_t capacity) {
    try {
        if (!handle) throw std::invalid_argument("Nova null draw handle");
        validate(upload);
        auto vertices = std::span(reinterpret_cast<const nova::Vertex*>(upload->vertices), upload->count);
        nova::Uniform uniform; std::memcpy(&uniform, upload->transform, sizeof(uniform));
        return static_cast<Nova*>(handle)->draw(vertices, uniform) ? 0 : 1;
    } catch (const std::exception& e) { return failure(error, capacity, e.what()); }
    catch (...) { return failure(error, capacity, "Nova draw exception"); }
}
extern "C" void nova_destroy(void* handle) {
    try { delete static_cast<Nova*>(handle); } catch (...) { /* ABI never throws */ }
}
