#pragma once
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
#include "../extern/Nova/Scene/types.h"
typedef nova::Vertex NovaVertex;
typedef nova::Stroke NovaStroke;
extern "C" {
#endif
#define NOVA_ABI_VERSION 4u
#define NOVA_VERTEX_CAPACITY 262144u
#define NOVA_KEY_CAPACITY 128u
#define NOVA_STROKE_CAPACITY 100000u
#define NOVA_POINTER_CAPACITY 128u
#define NOVA_SURFACE_VERTICES 65536u
#define NOVA_SURFACE_INDICES 393216u
// Borrowed pointers valid only during a call; handles are main-thread affine.
// Return 0 success, 1 draw skipped, negative error (message is UTF-8, NUL terminated).
#ifndef __cplusplus
typedef struct { float position[4]; float color[4]; } NovaVertex;
typedef struct { float a[4]; float b[4]; float color[4]; } NovaStroke;
#endif
typedef struct {
    uint32_t scancode, down, modifiers;
} NovaKeyEvent;
typedef struct { uint32_t kind; float x, y, delta; } NovaPointerEvent;
typedef struct {
    uint32_t version, size;
    const NovaVertex* vertices;
    uint32_t count, stride;
    float transform[16];
    const NovaStroke* strokes;
    uint32_t stroke_count, stroke_stride, hud_start;
    const NovaVertex* surface;
    const uint32_t* indices;
    uint32_t surface_count, index_count;
} NovaUpload;
typedef struct {
    uint32_t version, size, width, height, close, minimized;
    float orbit_x, orbit_y, zoom;
    uint32_t focused, input_reset, key_count;
    NovaKeyEvent keys[NOVA_KEY_CAPACITY];
    uint32_t pointer_count;
    NovaPointerEvent pointers[NOVA_POINTER_CAPACITY];
} NovaEvents;
int32_t nova_create(uint32_t width, uint32_t height, void** output, char* error, size_t capacity);
int32_t nova_poll(void* handle, NovaEvents* events, char* error, size_t capacity);
int32_t nova_draw(void* handle, const NovaUpload* upload, char* error, size_t capacity);
int32_t nova_validate_upload(const NovaUpload* upload, char* error, size_t capacity);
void nova_destroy(void* handle);
#ifdef __cplusplus
}
#endif
