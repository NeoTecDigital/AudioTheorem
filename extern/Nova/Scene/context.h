#pragma once
#include "types.h"
#include <SDL2/SDL.h>
#include <vulkan/vulkan.h>
#include <stdexcept>
#include <thread>
#include <vector>

namespace nova {
inline void check(VkResult result, const char* operation) {
    if (result != VK_SUCCESS) throw std::runtime_error(operation);
}
struct Frame {
    VkCommandBuffer command = VK_NULL_HANDLE;
    VkBuffer vertices = VK_NULL_HANDLE;
    VkDeviceMemory memory = VK_NULL_HANDLE;
    void* mapped = nullptr;
    VkSemaphore acquired = VK_NULL_HANDLE;
    VkFence fence = VK_NULL_HANDLE;
};
struct Presentation {
    VkSwapchainKHR chain = VK_NULL_HANDLE;
    VkFormat format = VK_FORMAT_UNDEFINED;
    VkExtent2D extent = {};
    std::vector<VkImage> images;
    std::vector<VkImageView> views;
    std::vector<VkFramebuffer> buffers;
    std::vector<VkSemaphore> finished;
};
struct Context {
    SDL_Window* window = nullptr;
    bool sdl = false, resized = false, minimized = false, closed = false;
    std::thread::id owner = std::this_thread::get_id();
    VkInstance instance = VK_NULL_HANDLE;
    VkSurfaceKHR surface = VK_NULL_HANDLE;
    VkPhysicalDevice physical = VK_NULL_HANDLE;
    VkDevice device = VK_NULL_HANDLE;
    uint32_t family = 0, frame = 0;
    VkQueue queue = VK_NULL_HANDLE;
    VkRenderPass pass = VK_NULL_HANDLE;
    VkPipelineLayout layout = VK_NULL_HANDLE;
    VkPipeline pipeline = VK_NULL_HANDLE;
    VkCommandPool pool = VK_NULL_HANDLE;
    std::array<Frame, 2> frames;
    Presentation present;
    ~Context();
};
void check_thread(const Context&);
void init_window(Context&, uint32_t, uint32_t);
void init_device(Context&);
void init_present(Context&);
void init_pass(Context&);
void init_pipeline(Context&, Pipeline);
void init_frames(Context&);
void init_framebuffers(Context&);
void destroy_present(Context&);
bool resize(Context&);
bool draw(Context&, std::span<const Vertex>, const Uniform&);
Events poll(Context&);
}
