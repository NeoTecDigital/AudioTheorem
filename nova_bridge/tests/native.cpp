#include "../nova_visualizer.h"
#include "../../extern/Nova/Nova.h"
#include "../../extern/Nova/Scene/input.h"
#include <SDL2/SDL.h>
#include <array>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstring>
#include <iostream>
#include <thread>

static NovaUpload upload() {
    NovaUpload u{};
    u.version = NOVA_ABI_VERSION; u.size = sizeof(u); u.stride = sizeof(NovaVertex); u.stroke_stride = sizeof(NovaStroke);
    u.transform[0] = u.transform[5] = u.transform[10] = u.transform[15] = 1.0f;
    return u;
}
static void boundary() {
    char error[256]{};
    auto u = upload();
    assert(nova_validate_upload(nullptr, error, sizeof(error)) < 0);
    assert(nova_validate_upload(&u, error, sizeof(error)) == 0);
    u.count = NOVA_VERTEX_CAPACITY + 1;
    assert(nova_validate_upload(&u, error, sizeof(error)) < 0);
    u.count = 0; u.version = 999;
    assert(nova_validate_upload(&u, error, sizeof(error)) < 0);
    u.version = NOVA_ABI_VERSION; u.transform[0] = NAN;
    assert(nova_validate_upload(&u, error, sizeof(error)) < 0);
    void* handle = reinterpret_cast<void*>(1);
    assert(nova_create(0, 0, &handle, error, sizeof(error)) < 0);
    assert(handle == nullptr);
    nova_destroy(nullptr);
    std::cout << "ABI rejection and failed-create tests passed\n";
}
static void stroke_boundary() {
    char error[256]{};
    NovaStroke stroke{{0,0,0,1.5f},{1,1,0,1},{1,1,1,1}};
    auto u = upload(); u.strokes = &stroke; u.stroke_count = 1;
    assert(nova_validate_upload(&u, error, sizeof(error)) == 0);
    stroke.a[3] = NAN; assert(nova_validate_upload(&u, error, sizeof(error)) < 0);
    stroke.a[3] = 1; u.stroke_count = NOVA_STROKE_CAPACITY + 1;
    assert(nova_validate_upload(&u, error, sizeof(error)) < 0);
    u.stroke_count = 0; u.hud_start = 3;
    assert(nova_validate_upload(&u, error, sizeof(error)) < 0);
    static_assert(sizeof(NovaUpload) == 136);
    static_assert(sizeof(NovaStroke) == 48);
    std::cout << "Instanced stroke bounds, finite widths, HUD split and layout passed\n";
}
static void surface_boundary() {
    char error[256]{};
    auto u=upload();
    NovaVertex v{{0,0,0,2},{1,1,1,1}};
    std::array<uint32_t,3> indices{0,0,0};
    u.surface=&v; u.surface_count=1; u.indices=indices.data(); u.index_count=3;
    assert(nova_validate_upload(&u,error,sizeof(error))==0);
    indices[2]=1; assert(nova_validate_upload(&u,error,sizeof(error))<0);
    indices[2]=0; v.position[0]=NAN; assert(nova_validate_upload(&u,error,sizeof(error))<0);
    v.position[0]=0; u.index_count=2; assert(nova_validate_upload(&u,error,sizeof(error))<0);
    u.index_count=NOVA_SURFACE_INDICES+3; assert(nova_validate_upload(&u,error,sizeof(error))<0);
    u.index_count=3; u.indices=nullptr; assert(nova_validate_upload(&u,error,sizeof(error))<0);
    u.indices=indices.data(); u.surface_count=NOVA_SURFACE_VERTICES+1;
    assert(nova_validate_upload(&u,error,sizeof(error))<0);
    std::cout << "Indexed surface capacities, indices and finite values passed\n";
}
static void pointers(void* handle) {
    char error[256]{};
    NovaEvents out{}; out.version = NOVA_ABI_VERSION; out.size = sizeof(out);
    assert(nova_poll(handle, &out, error, sizeof(error)) == 0);
    SDL_Event e{}; e.type = SDL_MOUSEBUTTONDOWN; e.button.button = SDL_BUTTON_LEFT;
    e.button.x = 40; e.button.y = 60; SDL_PushEvent(&e);
    e.type = SDL_MOUSEBUTTONUP; SDL_PushEvent(&e);
    assert(nova_poll(handle, &out, error, sizeof(error)) == 0);
    assert(out.pointer_count >= 2 && out.pointers[0].kind == 1 && out.pointers[1].kind == 3);
    for (uint32_t i = 0; i < NOVA_POINTER_CAPACITY + 1; ++i) SDL_PushEvent(&e);
    assert(nova_poll(handle, &out, error, sizeof(error)) == 0);
    assert(out.pointer_count == NOVA_POINTER_CAPACITY && out.input_reset);
    std::cout << "Pointer order, normalization and overflow reset passed\n";
}
static void window_event(uint8_t kind) {
    SDL_Event event{}; event.type = SDL_WINDOWEVENT; event.window.event = kind;
    SDL_PushEvent(&event);
}
static void cycle_events(int frame) {
    if (frame == 20) window_event(SDL_WINDOWEVENT_MINIMIZED);
    if (frame == 40) window_event(SDL_WINDOWEVENT_RESTORED);
    if (frame == 60) window_event(SDL_WINDOWEVENT_SIZE_CHANGED);
    if (frame == 80) window_event(SDL_WINDOWEVENT_SIZE_CHANGED);
}
static void partial_texture_failure() {
    bool failed=false;
    try { Nova app(640,480,{{},{},{},{}},{0,1,{}}); }
    catch (const std::invalid_argument&) { failed=true; }
    assert(failed);
    std::cout << "Partial texture initialization safely rejected and cleaned up\n";
}
static void window() {
    char error[256]{};
    void* handle = nullptr;
    if (nova_create(640, 480, &handle, error, sizeof(error)) < 0)
        throw std::runtime_error(error);
    pointers(handle);
    std::array<NovaVertex, 3> triangle{{
        {{-0.7f,0.5f,0.5f,1},{0.12f,0.79f,0.48f,1}},
        {{0.7f,0.5f,0.5f,1},{0.94f,0.63f,0.18f,1}},
        {{0,-0.5f,0.5f,1},{0.17f,0.90f,0.97f,1}}}};
    auto u = upload(); u.count = 3; u.hud_start = 3; u.vertices = triangle.data();
    NovaStroke stroke{{-0.8f,-0.7f,0,1.5f},{0.8f,0.7f,0,1},{0.2f,0.9f,1,0.8f}};
    u.strokes = &stroke; u.stroke_count = 1;
    std::array<uint32_t,3> indices{0,1,2};
    auto surface=triangle; for (auto& v:surface) v.position[3]=2;
    u.surface=surface.data(); u.surface_count=3; u.indices=indices.data(); u.index_count=3;
    for (int i = 0; i < 120; ++i) {
        cycle_events(i);
        NovaEvents events{}; events.version = NOVA_ABI_VERSION; events.size = sizeof(events);
        if (nova_poll(handle, &events, error, sizeof(error)) < 0) throw std::runtime_error(error);
        if (nova_draw(handle, &u, error, sizeof(error)) < 0) throw std::runtime_error(error);
        std::this_thread::sleep_for(std::chrono::milliseconds(17));
    }
    nova_destroy(handle);
    std::cout << "Native draw/minimize/restore/resize cycles passed\n";
}
static void keyboard() {
    nova::Events out;
    SDL_Event e{}; e.type = SDL_KEYDOWN; e.key.keysym.scancode = SDL_SCANCODE_Z;
    nova::append_input(out, e);
    assert(out.key_count == 1 && out.keys[0].scancode == SDL_SCANCODE_Z && out.keys[0].down);
    e.key.repeat = 1; nova::append_input(out, e); assert(out.key_count == 1);
    e.key.repeat = 0; e.type = SDL_KEYUP;
    nova::append_input(out, e); assert(!out.keys[1].down);
    for (size_t i = 0; i < nova::key_capacity; ++i) nova::append_input(out, e);
    assert(out.key_count == nova::key_capacity && out.input_reset);
    out = {}; e.type = SDL_WINDOWEVENT; e.window.event = SDL_WINDOWEVENT_FOCUS_LOST;
    nova::append_input(out, e); assert(out.input_reset);
    static_assert(sizeof(NovaEvents) == 3636);
    std::cout << "Keyboard ordering, repeats, overflow and focus-reset tests passed\n";
}
int main(int argc, char** argv) {
    boundary();
    stroke_boundary();
    surface_boundary();
    keyboard();
    if (argc > 1 && std::strcmp(argv[1], "--window") == 0) { partial_texture_failure(); window(); }
}
