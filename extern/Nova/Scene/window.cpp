#include "context.h"
#include "input.h"
#include "pointer.h"
#include <SDL2/SDL_vulkan.h>

namespace nova {
void check_thread(const Context& context) {
    if (context.owner != std::this_thread::get_id())
        throw std::runtime_error("Nova called off creating thread");
}
void init_window(Context& c, uint32_t width, uint32_t height) {
    if (width < 64 || height < 64 || width > 8192 || height > 8192)
        throw std::invalid_argument("Nova window dimensions");
    if (SDL_InitSubSystem(SDL_INIT_VIDEO) != 0) throw std::runtime_error(SDL_GetError());
    c.sdl = true;
    c.window = SDL_CreateWindow("HARMONIC / Nova", SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED, width, height,
        SDL_WINDOW_VULKAN | SDL_WINDOW_RESIZABLE | SDL_WINDOW_ALLOW_HIGHDPI);
    if (!c.window) throw std::runtime_error(SDL_GetError());
}
static void window_event(Context& c, const SDL_Event& e) {
    if (e.window.event == SDL_WINDOWEVENT_MINIMIZED) c.minimized = true;
    if (e.window.event == SDL_WINDOWEVENT_RESTORED) c.minimized = false;
    if (e.window.event == SDL_WINDOWEVENT_SIZE_CHANGED) c.resized = true;
    if (e.window.event == SDL_WINDOWEVENT_CLOSE) c.closed = true;
}
static void event(Context& c, Events& out, const SDL_Event& e) {
    if (e.type == SDL_QUIT) c.closed = true;
    if (e.type == SDL_WINDOWEVENT) window_event(c, e);
    append_input(out, e);
    append_pointer(out, e, c.window);
    if (e.type == SDL_MOUSEWHEEL) out.zoom += float(e.wheel.y);
    if (e.type != SDL_MOUSEMOTION || !(e.motion.state & SDL_BUTTON_LMASK)) return;
    out.orbit_x += float(e.motion.xrel);
    out.orbit_y += float(e.motion.yrel);
}
Events poll(Context& c) {
    check_thread(c);
    Events out;
    SDL_Event e;
    while (SDL_PollEvent(&e)) event(c, out, e);
    int w = 0, h = 0;
    SDL_Vulkan_GetDrawableSize(c.window, &w, &h);
    out.width = uint32_t(std::max(w, 0));
    out.height = uint32_t(std::max(h, 0));
    out.minimized = c.minimized || w == 0 || h == 0;
    out.close = c.closed;
    out.focused = (SDL_GetWindowFlags(c.window) & SDL_WINDOW_INPUT_FOCUS) != 0;
    if (!out.focused || out.input_reset) SDL_CaptureMouse(SDL_FALSE);
    return out;
}
}
