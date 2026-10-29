#include "context.h"
#include <SDL2/SDL_vulkan.h>
#include <cstring>
#include <cstdlib>
#include <optional>

namespace nova {
static bool validation_available() {
    uint32_t count = 0;
    vkEnumerateInstanceLayerProperties(&count, nullptr);
    std::vector<VkLayerProperties> layers(count);
    vkEnumerateInstanceLayerProperties(&count, layers.data());
    for (const auto& layer : layers)
        if (std::strcmp(layer.layerName, "VK_LAYER_KHRONOS_validation") == 0) return true;
    return false;
}
static void instance(Context& c) {
    uint32_t count = 0;
    if (!SDL_Vulkan_GetInstanceExtensions(c.window, &count, nullptr))
        throw std::runtime_error(SDL_GetError());
    std::vector<const char*> extensions(count);
    SDL_Vulkan_GetInstanceExtensions(c.window, &count, extensions.data());
    VkApplicationInfo app{VK_STRUCTURE_TYPE_APPLICATION_INFO};
    app.pApplicationName = "Harmonic";
    app.pEngineName = "Nova";
    app.apiVersion = VK_API_VERSION_1_1;
    VkInstanceCreateInfo info{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};
    info.pApplicationInfo = &app;
    info.enabledExtensionCount = count;
    info.ppEnabledExtensionNames = extensions.data();
    const char* layer = "VK_LAYER_KHRONOS_validation";
    if (std::getenv("NOVA_VALIDATION") && validation_available()) {
        info.enabledLayerCount = 1;
        info.ppEnabledLayerNames = &layer;
    }
    check(vkCreateInstance(&info, nullptr, &c.instance), "Nova instance");
    if (!SDL_Vulkan_CreateSurface(c.window, c.instance, &c.surface))
        throw std::runtime_error(SDL_GetError());
}
static std::optional<uint32_t> graphics_family(Context& c, VkPhysicalDevice device) {
    uint32_t count = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(device, &count, nullptr);
    std::vector<VkQueueFamilyProperties> queues(count);
    vkGetPhysicalDeviceQueueFamilyProperties(device, &count, queues.data());
    for (uint32_t i = 0; i < count; ++i) {
        VkBool32 presents = false;
        vkGetPhysicalDeviceSurfaceSupportKHR(device, i, c.surface, &presents);
        if (presents && (queues[i].queueFlags & VK_QUEUE_GRAPHICS_BIT)) return i;
    }
    return {};
}
static void pick_device(Context& c) {
    uint32_t count = 0;
    check(vkEnumeratePhysicalDevices(c.instance, &count, nullptr), "Nova devices");
    std::vector<VkPhysicalDevice> devices(count);
    check(vkEnumeratePhysicalDevices(c.instance, &count, devices.data()), "Nova devices");
    for (auto device : devices) {
        auto family = graphics_family(c, device);
        if (!family) continue;
        c.physical = device;
        c.family = *family;
        return;
    }
    throw std::runtime_error("Nova: no graphics+present Vulkan device");
}
static void logical_device(Context& c) {
    float priority = 1.0f;
    VkDeviceQueueCreateInfo queue{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO};
    queue.queueFamilyIndex = c.family;
    queue.queueCount = 1;
    queue.pQueuePriorities = &priority;
    const char* extension = VK_KHR_SWAPCHAIN_EXTENSION_NAME;
    VkDeviceCreateInfo info{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
    info.queueCreateInfoCount = 1;
    info.pQueueCreateInfos = &queue;
    info.enabledExtensionCount = 1;
    info.ppEnabledExtensionNames = &extension;
    check(vkCreateDevice(c.physical, &info, nullptr, &c.device), "Nova logical device");
    vkGetDeviceQueue(c.device, c.family, 0, &c.queue);
}
void init_device(Context& c) { instance(c); pick_device(c); logical_device(c); }
}
