#pragma once
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
#include "../extern/Nova/Scene/types.h"
typedef nova::Vertex NovaVertex;
extern "C" {
#endif
#define NOVA_ABI_VERSION 2u
#define NOVA_VERTEX_CAPACITY 262144u
#define NOVA_KEY_CAPACITY 128u
// Borrowed pointers valid only during a call; handles are main-thread affine.
// Return 0 success, 1 draw skipped, negative error (message is UTF-8, NUL terminated).
#ifndef __cplusplus
typedef struct { float position[4]; float color[4]; } NovaVertex;
#endif
typedef struct {
    uint32_t scancode, down, modifiers;
} NovaKeyEvent;
typedef struct {
    uint32_t version, size;
    const NovaVertex* vertices;
    uint32_t count, stride;
    float transform[16];
} NovaUpload;
typedef struct {
    uint32_t version, size, width, height, close, minimized;
    float orbit_x, orbit_y, zoom;
    uint32_t focused, input_reset, key_count;
    NovaKeyEvent keys[NOVA_KEY_CAPACITY];
} NovaEvents;
int32_t nova_create(uint32_t width, uint32_t height, void** output, char* error, size_t capacity);
int32_t nova_poll(void* handle, NovaEvents* events, char* error, size_t capacity);
int32_t nova_draw(void* handle, const NovaUpload* upload, char* error, size_t capacity);
int32_t nova_validate_upload(const NovaUpload* upload, char* error, size_t capacity);
void nova_destroy(void* handle);
#ifdef __cplusplus
}
#endif
