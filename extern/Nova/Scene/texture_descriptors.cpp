#include "context.h"
namespace nova {
void texture_descriptors(Context &c) {
    auto &t = c.texture;
    VkImageViewCreateInfo view{VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO};
    view.image = t.image;
    view.viewType = VK_IMAGE_VIEW_TYPE_2D;
    view.format = VK_FORMAT_R8G8B8A8_UNORM;
    view.subresourceRange = {VK_IMAGE_ASPECT_COLOR_BIT, 0, 1, 0, 1};
    check(vkCreateImageView(c.device, &view, nullptr, &t.view), "Nova texture view");
    VkSamplerCreateInfo sampler{VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO};
    sampler.magFilter = sampler.minFilter = VK_FILTER_LINEAR;
    sampler.addressModeU = sampler.addressModeV = sampler.addressModeW =
        VK_SAMPLER_ADDRESS_MODE_CLAMP_TO_EDGE;
    check(vkCreateSampler(c.device, &sampler, nullptr, &t.sampler), "Nova texture sampler");
    VkDescriptorSetLayoutBinding binding{0, VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1,
                                         VK_SHADER_STAGE_FRAGMENT_BIT, nullptr};
    VkDescriptorSetLayoutCreateInfo layout{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO};
    layout.bindingCount = 1;
    layout.pBindings = &binding;
    check(vkCreateDescriptorSetLayout(c.device, &layout, nullptr, &t.layout), "Nova texture layout");
    VkDescriptorPoolSize size{VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER, 1};
    VkDescriptorPoolCreateInfo pool{VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO};
    pool.maxSets = 1;
    pool.poolSizeCount = 1;
    pool.pPoolSizes = &size;
    check(vkCreateDescriptorPool(c.device, &pool, nullptr, &t.pool), "Nova texture descriptor pool");
    VkDescriptorSetAllocateInfo alloc{VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO};
    alloc.descriptorPool = t.pool;
    alloc.descriptorSetCount = 1;
    alloc.pSetLayouts = &t.layout;
    check(vkAllocateDescriptorSets(c.device, &alloc, &t.set), "Nova texture descriptor");
    VkDescriptorImageInfo image{t.sampler, t.view, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL};
    VkWriteDescriptorSet write{VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET};
    write.dstSet = t.set;
    write.dstBinding = 0;
    write.descriptorCount = 1;
    write.descriptorType = VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;
    write.pImageInfo = &image;
    vkUpdateDescriptorSets(c.device, 1, &write, 0, nullptr);
}
void destroy_texture(Context &c) {
    auto &t = c.texture;
    if (t.pool)
        vkDestroyDescriptorPool(c.device, t.pool, nullptr);
    if (t.layout)
        vkDestroyDescriptorSetLayout(c.device, t.layout, nullptr);
    if (t.sampler)
        vkDestroySampler(c.device, t.sampler, nullptr);
    if (t.view)
        vkDestroyImageView(c.device, t.view, nullptr);
    if (t.image)
        vkDestroyImage(c.device, t.image, nullptr);
    if (t.memory)
        vkFreeMemory(c.device, t.memory, nullptr);
}
} // namespace nova
