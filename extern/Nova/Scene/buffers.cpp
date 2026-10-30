#include "context.h"

namespace nova {
static uint32_t memory_type(Context& c, uint32_t bits) {
    VkPhysicalDeviceMemoryProperties memory{};
    vkGetPhysicalDeviceMemoryProperties(c.physical, &memory);
    VkMemoryPropertyFlags flags = VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT;
    for (uint32_t i = 0; i < memory.memoryTypeCount; ++i)
        if ((bits & (1u << i)) && (memory.memoryTypes[i].propertyFlags & flags) == flags) return i;
    throw std::runtime_error("Nova host coherent memory unavailable");
}
static void buffer(Context& c, Frame& frame) {
    VkBufferCreateInfo info{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
    info.size = geometry_bytes;
    info.usage = VK_BUFFER_USAGE_VERTEX_BUFFER_BIT | VK_BUFFER_USAGE_INDEX_BUFFER_BIT;
    info.sharingMode = VK_SHARING_MODE_EXCLUSIVE;
    check(vkCreateBuffer(c.device, &info, nullptr, &frame.vertices), "Nova vertex buffer");
    VkMemoryRequirements need{};
    vkGetBufferMemoryRequirements(c.device, frame.vertices, &need);
    VkMemoryAllocateInfo alloc{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
    alloc.allocationSize = need.size;
    alloc.memoryTypeIndex = memory_type(c, need.memoryTypeBits);
    check(vkAllocateMemory(c.device, &alloc, nullptr, &frame.memory), "Nova vertex memory");
    check(vkBindBufferMemory(c.device, frame.vertices, frame.memory, 0), "Nova bind vertex memory");
    check(vkMapMemory(c.device, frame.memory, 0, info.size, 0, &frame.mapped), "Nova map vertex memory");
}
static void frame_resources(Context& c, Frame& frame) {
    buffer(c, frame);
    VkCommandBufferAllocateInfo command{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
    command.commandPool = c.pool;
    command.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    command.commandBufferCount = 1;
    check(vkAllocateCommandBuffers(c.device, &command, &frame.command), "Nova command buffer");
    VkSemaphoreCreateInfo sem{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
    check(vkCreateSemaphore(c.device, &sem, nullptr, &frame.acquired), "Nova acquire semaphore");
    VkFenceCreateInfo fence{VK_STRUCTURE_TYPE_FENCE_CREATE_INFO};
    fence.flags = VK_FENCE_CREATE_SIGNALED_BIT;
    check(vkCreateFence(c.device, &fence, nullptr, &frame.fence), "Nova frame fence");
}
void init_frames(Context& c) {
    VkCommandPoolCreateInfo pool{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
    pool.queueFamilyIndex = c.family;
    pool.flags = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
    check(vkCreateCommandPool(c.device, &pool, nullptr, &c.pool), "Nova command pool");
    for (auto& frame : c.frames) frame_resources(c, frame);
}
static void destroy_frame(Context& c, Frame& f) {
    if (f.mapped) vkUnmapMemory(c.device, f.memory);
    if (f.vertices) vkDestroyBuffer(c.device, f.vertices, nullptr);
    if (f.memory) vkFreeMemory(c.device, f.memory, nullptr);
    if (f.acquired) vkDestroySemaphore(c.device, f.acquired, nullptr);
    if (f.fence) vkDestroyFence(c.device, f.fence, nullptr);
}
Context::~Context() {
    if (device) {
        vkDeviceWaitIdle(device);
        for (auto& frame : frames) destroy_frame(*this, frame);
        destroy_present(*this);
        if (pool) vkDestroyCommandPool(device, pool, nullptr);
        if (stroke_pipeline) vkDestroyPipeline(device, stroke_pipeline, nullptr);
        if (pipeline) vkDestroyPipeline(device, pipeline, nullptr);
        if (layout) vkDestroyPipelineLayout(device, layout, nullptr);
        destroy_texture(*this);
        if (pass) vkDestroyRenderPass(device, pass, nullptr);
        vkDestroyDevice(device, nullptr);
    }
    if (surface) vkDestroySurfaceKHR(instance, surface, nullptr);
    if (instance) vkDestroyInstance(instance, nullptr);
    if (window) SDL_DestroyWindow(window);
    if (sdl) SDL_QuitSubSystem(SDL_INIT_VIDEO);
}
}
