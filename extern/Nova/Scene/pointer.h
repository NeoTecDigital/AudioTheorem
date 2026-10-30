#pragma once
#include "types.h"
#include <SDL2/SDL.h>
namespace nova {
inline void append_pointer(Events& out, const SDL_Event& e, SDL_Window* window) {
    PointerEvent p{};
    int x = 0, y = 0, w = 1, h = 1;
    SDL_GetWindowSize(window, &w, &h);
    if (e.type == SDL_MOUSEMOTION) { p.kind = 2; x = e.motion.x; y = e.motion.y; }
    else if (e.type == SDL_MOUSEWHEEL) {
        p.kind = 4; p.delta = float(e.wheel.y);
        if (e.wheel.direction == SDL_MOUSEWHEEL_FLIPPED) p.delta = -p.delta;
        SDL_GetMouseState(&x, &y);
    } else if ((e.type == SDL_MOUSEBUTTONDOWN || e.type == SDL_MOUSEBUTTONUP)
               && e.button.button == SDL_BUTTON_LEFT) {
        p.kind = e.type == SDL_MOUSEBUTTONDOWN ? 1u : 3u;
        x = e.button.x; y = e.button.y;
        SDL_CaptureMouse(p.kind == 1 ? SDL_TRUE : SDL_FALSE);
    } else return;
    p.x = float(x) / float(std::max(w, 1)); p.y = float(y) / float(std::max(h, 1));
    if (out.pointer_count == pointer_capacity) { out.input_reset = true; return; }
    out.pointers[out.pointer_count++] = p;
}
}
