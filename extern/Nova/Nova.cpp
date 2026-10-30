#include "Nova.h"
#include "Scene/context.h"

Nova::Nova(uint32_t width, uint32_t height, nova::Pipeline pipeline, nova::Image artwork)
    : context(std::make_unique<nova::Context>()) {
    nova::init_window(*context, width, height);
    nova::init_device(*context);
    nova::init_present(*context);
    nova::init_pass(*context);
    nova::init_texture(*context, artwork);
    nova::init_pipeline(*context, pipeline);
    nova::init_frames(*context);
    nova::init_framebuffers(*context);
}
Nova::~Nova() = default;
nova::Events Nova::poll() { return nova::poll(*context); }
bool Nova::draw(nova::Geometry geometry, const nova::Uniform& uniform) {
    nova::check_thread(*context);
    if (geometry.vertices.size() > nova::vertex_capacity || geometry.strokes.size() > nova::stroke_capacity
        || geometry.surface.size() > nova::surface_vertex_capacity || geometry.indices.size() > nova::surface_index_capacity)
        throw std::length_error("Nova geometry capacity");
    if (geometry.hud_start>geometry.vertices.size() || geometry.indices.size()%3)
        throw std::invalid_argument("Nova geometry boundaries");
    for (auto index:geometry.indices)
        if (index>=geometry.surface.size()) throw std::out_of_range("Nova geometry index");
    return nova::draw(*context, geometry, uniform);
}
