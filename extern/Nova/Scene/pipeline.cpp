#include "context.h"

namespace nova {
void init_pass(Context& c) {
    VkAttachmentDescription color{};
    color.format = c.present.format;
    color.samples = VK_SAMPLE_COUNT_1_BIT;
    color.loadOp = VK_ATTACHMENT_LOAD_OP_CLEAR;
    color.storeOp = VK_ATTACHMENT_STORE_OP_STORE;
    color.stencilLoadOp = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    color.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    color.initialLayout = VK_IMAGE_LAYOUT_UNDEFINED;
    color.finalLayout = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;
    VkAttachmentReference attachment{0, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL};
    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 1;
    subpass.pColorAttachments = &attachment;
    VkSubpassDependency dependency{};
    dependency.srcSubpass = VK_SUBPASS_EXTERNAL;
    dependency.dstSubpass = 0;
    dependency.srcStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dependency.dstStageMask = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dependency.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;
    VkRenderPassCreateInfo info{VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO};
    info.attachmentCount = 1; info.pAttachments = &color;
    info.subpassCount = 1; info.pSubpasses = &subpass;
    info.dependencyCount = 1; info.pDependencies = &dependency;
    check(vkCreateRenderPass(c.device, &info, nullptr, &c.pass), "Nova render pass");
}
static VkShaderModule shader(Context& c, std::span<const uint32_t> words) {
    if (words.empty() || words[0] != 0x07230203) throw std::invalid_argument("Nova shader SPIR-V");
    VkShaderModuleCreateInfo info{VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO};
    info.codeSize = words.size_bytes();
    info.pCode = words.data();
    VkShaderModule module = VK_NULL_HANDLE;
    check(vkCreateShaderModule(c.device, &info, nullptr, &module), "Nova shader");
    return module;
}
struct Stages {
    Context& context;
    std::array<VkPipelineShaderStageCreateInfo, 2> info{};
    explicit Stages(Context& c) : context(c) {}
    ~Stages() { for (auto s : info) if (s.module) vkDestroyShaderModule(context.device, s.module, nullptr); }
    void init(Pipeline p) {
        info[0] = {VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO};
        info[0].stage = VK_SHADER_STAGE_VERTEX_BIT;
        info[0].module = shader(context, p.vertex);
        info[0].pName = "main";
        info[1] = {VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO};
        info[1].stage = VK_SHADER_STAGE_FRAGMENT_BIT;
        info[1].module = shader(context, p.fragment);
        info[1].pName = "main";
    }
};
struct PipelineState {
    VkVertexInputBindingDescription binding{0, sizeof(Vertex), VK_VERTEX_INPUT_RATE_VERTEX};
    std::array<VkVertexInputAttributeDescription, 3> attributes{{
        {0, 0, VK_FORMAT_R32G32B32A32_SFLOAT, 0}, {1, 0, VK_FORMAT_R32G32B32A32_SFLOAT, 16}, {2, 0, VK_FORMAT_R32G32B32A32_SFLOAT, 32}}};
    VkPipelineVertexInputStateCreateInfo vertex{VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO};
    VkPipelineInputAssemblyStateCreateInfo assembly{VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO};
    VkPipelineViewportStateCreateInfo viewport{VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO};
    VkPipelineRasterizationStateCreateInfo raster{VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO};
    VkPipelineMultisampleStateCreateInfo multisample{VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO};
    VkPipelineColorBlendAttachmentState blend{};
    VkPipelineColorBlendStateCreateInfo color{VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO};
    std::array<VkDynamicState, 2> dynamic_values{VK_DYNAMIC_STATE_VIEWPORT, VK_DYNAMIC_STATE_SCISSOR};
    VkPipelineDynamicStateCreateInfo dynamic{VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO};
    PipelineState();
};
PipelineState::PipelineState() {
    vertex.vertexBindingDescriptionCount = 1; vertex.pVertexBindingDescriptions = &binding;
    vertex.vertexAttributeDescriptionCount = 2; vertex.pVertexAttributeDescriptions = attributes.data();
    assembly.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    viewport.viewportCount = 1; viewport.scissorCount = 1;
    raster.polygonMode = VK_POLYGON_MODE_FILL; raster.cullMode = VK_CULL_MODE_NONE; raster.lineWidth = 1;
    multisample.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;
    blend.blendEnable = VK_TRUE;
    blend.srcColorBlendFactor = VK_BLEND_FACTOR_SRC_ALPHA;
    blend.dstColorBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
    blend.colorBlendOp = VK_BLEND_OP_ADD;
    blend.srcAlphaBlendFactor = VK_BLEND_FACTOR_ONE;
    blend.dstAlphaBlendFactor = VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;
    blend.alphaBlendOp = VK_BLEND_OP_ADD;
    blend.colorWriteMask = 15;
    color.attachmentCount = 1; color.pAttachments = &blend;
    dynamic.dynamicStateCount = 2; dynamic.pDynamicStates = dynamic_values.data();
}
void init_pipeline(Context& c, Pipeline shaders) {
    VkPushConstantRange range{VK_SHADER_STAGE_VERTEX_BIT, 0, sizeof(Uniform)};
    VkPipelineLayoutCreateInfo layout{VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO};
    layout.pushConstantRangeCount = 1; layout.pPushConstantRanges = &range;
    check(vkCreatePipelineLayout(c.device, &layout, nullptr, &c.layout), "Nova pipeline layout");
    Stages stages(c); stages.init(shaders);
    PipelineState state;
    VkGraphicsPipelineCreateInfo info{VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO};
    info.stageCount = 2; info.pStages = stages.info.data();
    info.pVertexInputState = &state.vertex; info.pInputAssemblyState = &state.assembly;
    info.pViewportState = &state.viewport; info.pRasterizationState = &state.raster;
    info.pMultisampleState = &state.multisample; info.pColorBlendState = &state.color;
    info.pDynamicState = &state.dynamic; info.layout = c.layout; info.renderPass = c.pass;
    check(vkCreateGraphicsPipelines(c.device, VK_NULL_HANDLE, 1, &info, nullptr, &c.pipeline), "Nova pipeline");
    Stages strokes(c); strokes.init(Pipeline{shaders.stroke_vertex, shaders.stroke_fragment, {}, {}});
    state.binding.stride = sizeof(Stroke); state.binding.inputRate = VK_VERTEX_INPUT_RATE_INSTANCE;
    state.vertex.vertexAttributeDescriptionCount = 3;
    info.pStages = strokes.info.data();
    check(vkCreateGraphicsPipelines(c.device, VK_NULL_HANDLE, 1, &info, nullptr, &c.stroke_pipeline), "Nova stroke pipeline");
}
}
