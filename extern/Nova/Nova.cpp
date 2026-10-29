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
bool Nova::draw(std::span<const nova::Vertex> vertices, const nova::Uniform& uniform) {
    nova::check_thread(*context);
    if (vertices.size() > nova::vertex_capacity) throw std::length_error("Nova vertex capacity");
    return nova::draw(*context, vertices, uniform);
}
