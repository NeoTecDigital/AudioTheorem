#include "context.h"
#include <cstring>
namespace nova {
static uint32_t memory_type(Context &c, uint32_t bits, VkMemoryPropertyFlags flags) {
    VkPhysicalDeviceMemoryProperties memory{};
    vkGetPhysicalDeviceMemoryProperties(c.physical, &memory);
    for (uint32_t i = 0; i < memory.memoryTypeCount; ++i)
        if ((bits & (1u << i)) && (memory.memoryTypes[i].propertyFlags & flags) == flags)
            return i;
    throw std::runtime_error("Nova texture memory unavailable");
}
static void create_image(Context &c, Image data) {
    auto &t = c.texture;
    VkImageCreateInfo info{VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO};
    info.imageType = VK_IMAGE_TYPE_2D;
    info.format = VK_FORMAT_R8G8B8A8_UNORM;
    info.extent = {data.width, data.height, 1};
    info.mipLevels = 1;
    info.arrayLayers = 1;
    info.samples = VK_SAMPLE_COUNT_1_BIT;
    info.tiling = VK_IMAGE_TILING_OPTIMAL;
    info.usage = VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_SAMPLED_BIT;
    check(vkCreateImage(c.device, &info, nullptr, &t.image), "Nova texture image");
    VkMemoryRequirements need{};
    vkGetImageMemoryRequirements(c.device, t.image, &need);
    VkMemoryAllocateInfo alloc{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
    alloc.allocationSize = need.size;
    alloc.memoryTypeIndex = memory_type(c, need.memoryTypeBits, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);
    check(vkAllocateMemory(c.device, &alloc, nullptr, &t.memory), "Nova texture memory");
    check(vkBindImageMemory(c.device, t.image, t.memory, 0), "Nova bind texture");
}
struct Staging {
    Context &c;
    VkBuffer buffer = VK_NULL_HANDLE;
    VkDeviceMemory memory = VK_NULL_HANDLE;
    VkCommandPool pool = VK_NULL_HANDLE;
    void *mapped = nullptr;
    explicit Staging(Context &context) : c(context) {}
    ~Staging() {
        if (mapped)
            vkUnmapMemory(c.device, memory);
        if (pool)
            vkDestroyCommandPool(c.device, pool, nullptr);
        if (buffer)
            vkDestroyBuffer(c.device, buffer, nullptr);
        if (memory)
            vkFreeMemory(c.device, memory, nullptr);
    }
    void init(std::span<const uint8_t> bytes);
    void transfer(Image);
};
void Staging::init(std::span<const uint8_t> bytes) {
    VkBufferCreateInfo info{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
    info.size = bytes.size();
    info.usage = VK_BUFFER_USAGE_TRANSFER_SRC_BIT;
    check(vkCreateBuffer(c.device, &info, nullptr, &buffer), "Nova texture staging");
    VkMemoryRequirements need{};
    vkGetBufferMemoryRequirements(c.device, buffer, &need);
    VkMemoryAllocateInfo alloc{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
    alloc.allocationSize = need.size;
    alloc.memoryTypeIndex = memory_type(
        c, need.memoryTypeBits, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    check(vkAllocateMemory(c.device, &alloc, nullptr, &memory), "Nova staging memory");
    check(vkBindBufferMemory(c.device, buffer, memory, 0), "Nova bind staging");
    check(vkMapMemory(c.device, memory, 0, bytes.size(), 0, &mapped), "Nova map staging");
    std::memcpy(mapped, bytes.data(), bytes.size());
}
static void barrier(VkCommandBuffer command, VkImage image, bool ready) {
    VkImageMemoryBarrier b{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER};
    b.image = image;
    b.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    b.srcQueueFamilyIndex = b.dstQueueFamilyIndex = VK_QUEUE_FAMILY_IGNORED;
    b.oldLayout = ready ? VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL : VK_IMAGE_LAYOUT_UNDEFINED;
    b.newLayout = ready ? VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL : VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
    b.srcAccessMask = ready ? VK_ACCESS_TRANSFER_WRITE_BIT : 0;
    b.dstAccessMask = ready ? VK_ACCESS_SHADER_READ_BIT : VK_ACCESS_TRANSFER_WRITE_BIT;
    vkCmdPipelineBarrier(command, ready ? VK_PIPELINE_STAGE_TRANSFER_BIT : VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,
                         ready ? VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT : VK_PIPELINE_STAGE_TRANSFER_BIT, 0, 0,
                         nullptr, 0, nullptr, 1, &b);
}
void Staging::transfer(Image data) {
    VkCommandPoolCreateInfo p{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
    p.queueFamilyIndex = c.family;
    check(vkCreateCommandPool(c.device, &p, nullptr, &pool), "Nova texture command pool");
    VkCommandBufferAllocateInfo a{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
    a.commandPool = pool;
    a.level = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    a.commandBufferCount = 1;
    VkCommandBuffer command{};
    check(vkAllocateCommandBuffers(c.device, &a, &command), "Nova texture command");
    VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    begin.flags = VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    check(vkBeginCommandBuffer(command, &begin), "Nova begin texture upload");
    barrier(command, c.texture.image, false);
    VkBufferImageCopy region{};
    region.imageSubresource = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 0, 1};
    region.imageExtent = {data.width, data.height, 1};
    vkCmdCopyBufferToImage(command, buffer, c.texture.image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1,
                           &region);
    barrier(command, c.texture.image, true);
    check(vkEndCommandBuffer(command), "Nova end texture upload");
    VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO};
    submit.commandBufferCount = 1;
    submit.pCommandBuffers = &command;
    check(vkQueueSubmit(c.queue, 1, &submit, VK_NULL_HANDLE), "Nova submit texture upload");
    check(vkQueueWaitIdle(c.queue), "Nova finish texture upload"); // Initialization only.
}
void init_texture(Context &c, Image data) {
    if (!data.width || !data.height || data.width > 4096 || data.height > 4096 ||
        data.rgba.size() != size_t(data.width) * data.height * 4)
        throw std::invalid_argument("Nova RGBA texture bounds");
    create_image(c, data);
    Staging staging(c);
    staging.init(data.rgba);
    staging.transfer(data);
    texture_descriptors(c);
}
} // namespace nova
