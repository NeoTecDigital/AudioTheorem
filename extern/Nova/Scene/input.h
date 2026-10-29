#pragma once
#include "types.h"
#include <SDL2/SDL.h>

namespace nova {
// No allocation and no truncation without explicit reset: callers release their held keys.
inline void append_input(Events& out, const SDL_Event& e) {
    if (e.type == SDL_WINDOWEVENT && (e.window.event == SDL_WINDOWEVENT_FOCUS_LOST ||
        e.window.event == SDL_WINDOWEVENT_MINIMIZED)) out.input_reset = true;
    if ((e.type != SDL_KEYDOWN && e.type != SDL_KEYUP) || e.key.repeat) return;
    if (out.key_count == key_capacity) { out.input_reset = true; return; }
    out.keys[out.key_count++] = {uint32_t(e.key.keysym.scancode),
        uint32_t(e.type == SDL_KEYDOWN), uint32_t(e.key.keysym.mod)};
}
}
