#include "context.h"
#include <SDL2/SDL_vulkan.h>
#include <algorithm>
#include <limits>

namespace nova {
static VkSurfaceFormatKHR surface_format(Context& c) {
    uint32_t count = 0;
    check(vkGetPhysicalDeviceSurfaceFormatsKHR(c.physical, c.surface, &count, nullptr), "Nova formats");
    std::vector<VkSurfaceFormatKHR> formats(count);
    check(vkGetPhysicalDeviceSurfaceFormatsKHR(c.physical, c.surface, &count, formats.data()), "Nova formats");
    if (formats.empty()) throw std::runtime_error("Nova: no surface format");
    for (auto f : formats)
        if (f.format == VK_FORMAT_B8G8R8A8_UNORM) return f;
    if (formats[0].format == VK_FORMAT_UNDEFINED)
        return {VK_FORMAT_B8G8R8A8_UNORM, VK_COLOR_SPACE_SRGB_NONLINEAR_KHR};
    return formats[0];
}
static VkExtent2D extent(Context& c, const VkSurfaceCapabilitiesKHR& caps) {
    if (caps.currentExtent.width != std::numeric_limits<uint32_t>::max()) return caps.currentExtent;
    int w = 0, h = 0;
    SDL_Vulkan_GetDrawableSize(c.window, &w, &h);
    return {std::clamp(uint32_t(std::max(w, 1)), caps.minImageExtent.width, caps.maxImageExtent.width),
            std::clamp(uint32_t(std::max(h, 1)), caps.minImageExtent.height, caps.maxImageExtent.height)};
}
static VkCompositeAlphaFlagBitsKHR alpha(const VkSurfaceCapabilitiesKHR& caps) {
    for (auto flag : {VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR, VK_COMPOSITE_ALPHA_PRE_MULTIPLIED_BIT_KHR,
                     VK_COMPOSITE_ALPHA_POST_MULTIPLIED_BIT_KHR, VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR})
        if (caps.supportedCompositeAlpha & flag) return flag;
    throw std::runtime_error("Nova surface alpha");
}
void init_present(Context& c) {
    VkSurfaceCapabilitiesKHR caps{};
    check(vkGetPhysicalDeviceSurfaceCapabilitiesKHR(c.physical, c.surface, &caps), "Nova surface caps");
    auto format = surface_format(c);
    c.present.format = format.format;
    c.present.extent = extent(c, caps);
    uint32_t count = caps.minImageCount + 1;
    if (caps.maxImageCount) count = std::min(count, caps.maxImageCount);
    VkSwapchainCreateInfoKHR info{VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR};
    info.surface = c.surface;
    info.minImageCount = count;
    info.imageFormat = format.format;
    info.imageColorSpace = format.colorSpace;
    info.imageExtent = c.present.extent;
    info.imageArrayLayers = 1;
    info.imageUsage = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT;
    info.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
    info.preTransform = caps.currentTransform;
    info.compositeAlpha = alpha(caps);
    info.presentMode = VK_PRESENT_MODE_FIFO_KHR;
    info.clipped = VK_TRUE;
    check(vkCreateSwapchainKHR(c.device, &info, nullptr, &c.present.chain), "Nova swapchain");
    check(vkGetSwapchainImagesKHR(c.device, c.present.chain, &count, nullptr), "Nova swap images");
    c.present.images.resize(count);
    check(vkGetSwapchainImagesKHR(c.device, c.present.chain, &count, c.present.images.data()), "Nova swap images");
}
static void image_resources(Context& c, size_t i) {
    VkImageViewCreateInfo view{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
    view.image = c.present.images[i];
    view.viewType = VK_IMAGE_VIEW_TYPE_2D;
    view.format = c.present.format;
    view.subresourceRange.aspectMask = VK_IMAGE_ASPECT_COLOR_BIT;
    view.subresourceRange.levelCount = 1;
    view.subresourceRange.layerCount = 1;
    check(vkCreateImageView(c.device, &view, nullptr, &c.present.views[i]), "Nova image view");
    VkFramebufferCreateInfo buffer{VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO};
    buffer.renderPass = c.pass;
    buffer.attachmentCount = 1;
    buffer.pAttachments = &c.present.views[i];
    buffer.width = c.present.extent.width;
    buffer.height = c.present.extent.height;
    buffer.layers = 1;
    check(vkCreateFramebuffer(c.device, &buffer, nullptr, &c.present.buffers[i]), "Nova framebuffer");
    VkSemaphoreCreateInfo sem{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
    check(vkCreateSemaphore(c.device, &sem, nullptr, &c.present.finished[i]), "Nova present semaphore");
}
void init_framebuffers(Context& c) {
    size_t count = c.present.images.size();
    c.present.views.resize(count, VK_NULL_HANDLE);
    c.present.buffers.resize(count, VK_NULL_HANDLE);
    c.present.finished.resize(count, VK_NULL_HANDLE);
    for (size_t i = 0; i < count; ++i) image_resources(c, i);
}
void destroy_present(Context& c) {
    for (auto x : c.present.buffers) if (x) vkDestroyFramebuffer(c.device, x, nullptr);
    for (auto x : c.present.views) if (x) vkDestroyImageView(c.device, x, nullptr);
    for (auto x : c.present.finished) if (x) vkDestroySemaphore(c.device, x, nullptr);
    if (c.present.chain) vkDestroySwapchainKHR(c.device, c.present.chain, nullptr);
    c.present = {};
}
bool resize(Context& c) {
    int width = 0, height = 0;
    SDL_Vulkan_GetDrawableSize(c.window, &width, &height);
    if (width == 0 || height == 0 || c.minimized) return false;
    check(vkDeviceWaitIdle(c.device), "Nova resize wait");
    VkFormat prior = c.present.format;
    destroy_present(c);
    init_present(c);
    if (prior != c.present.format) throw std::runtime_error("Nova surface format changed; relaunch required");
    init_framebuffers(c);
    c.resized = false;
    return true;
}
}
