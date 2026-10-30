#pragma once
#include "Scene/types.h"
#include <memory>

namespace nova { struct Context; }
// Main-thread, nonblocking public API. Scene data is borrowed for draw() only.
class Nova {
public:
    Nova(uint32_t width, uint32_t height, nova::Pipeline pipeline, nova::Image artwork);
    ~Nova();
    Nova(const Nova&) = delete;
    Nova& operator=(const Nova&) = delete;
    nova::Events poll();
    bool draw(nova::Geometry, const nova::Uniform&);
private:
    std::unique_ptr<nova::Context> context;
};
