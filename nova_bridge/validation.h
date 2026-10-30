#pragma once
#include "nova_visualizer.h"
#include <cmath>
#include <stdexcept>
inline void validate_vertices(const NovaVertex *vertices, uint32_t count) {
    for (uint32_t i = 0; i < count; ++i) {
        for (float v : vertices[i].position)
            if (!std::isfinite(v))
                throw std::invalid_argument("Nova nonfinite vertex");
        for (float v : vertices[i].color)
            if (!std::isfinite(v))
                throw std::invalid_argument("Nova nonfinite color");
    }
}
inline void validate_surface(const NovaUpload *frame) {
    if (frame->surface_count > NOVA_SURFACE_VERTICES || frame->index_count > NOVA_SURFACE_INDICES ||
        frame->index_count % 3 || (frame->surface_count && !frame->surface) ||
        (frame->index_count && !frame->indices))
        throw std::length_error("Nova surface bounds");
    validate_vertices(frame->surface, frame->surface_count);
    for (uint32_t i = 0; i < frame->index_count; ++i)
        if (frame->indices[i] >= frame->surface_count)
            throw std::out_of_range("Nova surface index");
}
