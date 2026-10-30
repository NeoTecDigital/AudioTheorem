#include "Nova.h"
#include "Scene/context.h"

Nova::Nova(uint32_t width, uint32_t height, nova::Pipeline pipeline)
    : context(std::make_unique<nova::Context>()) {
    nova::init_window(*context, width, height);
    nova::init_device(*context);
    nova::init_present(*context);
    nova::init_pass(*context);
    nova::init_pipeline(*context, pipeline);
    nova::init_frames(*context);
    nova::init_framebuffers(*context);
}
Nova::~Nova() = default;
nova::Events Nova::poll() { return nova::poll(*context); }
bool Nova::draw(nova::Geometry geometry, const nova::Uniform& uniform) {
    nova::check_thread(*context);
    if (geometry.vertices.size() > nova::vertex_capacity || geometry.strokes.size() > nova::stroke_capacity)
        throw std::length_error("Nova geometry capacity");
    return nova::draw(*context, geometry, uniform);
}
