#pragma once
#include "../extern/Nova/Scene/types.h"
#include "nova_artwork.h"
#include <SDL2/SDL_image.h>
#include <memory>
#include <stdexcept>
namespace {
using ImageSurface = std::unique_ptr<SDL_Surface, decltype(&SDL_FreeSurface)>;
inline ImageSurface load_artwork() {
    auto *input = SDL_RWFromConstMem(nova_artwork, sizeof(nova_artwork));
    if (!input)
        throw std::runtime_error("Audio Theorem logo input");
    ImageSurface decoded(IMG_Load_RW(input, 1), SDL_FreeSurface);
    if (!decoded)
        throw std::runtime_error("Audio Theorem logo decode");
    ImageSurface rgba(SDL_ConvertSurfaceFormat(decoded.get(), SDL_PIXELFORMAT_RGBA32, 0), SDL_FreeSurface);
    if (!rgba || rgba->w <= 0 || rgba->w > 4096 || rgba->h <= 0 || rgba->h > 4096 ||
        rgba->pitch != rgba->w * 4)
        throw std::runtime_error("Audio Theorem logo format");
    return rgba;
}
inline nova::Image image_view(SDL_Surface &s) {
    return {uint32_t(s.w), uint32_t(s.h), {static_cast<const uint8_t *>(s.pixels), size_t(s.pitch) * s.h}};
}
} // namespace
