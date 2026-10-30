#include "context.h"
#include <cstring>

namespace nova {
static void record(Context& c, Frame& f, uint32_t image, Geometry geometry, const Uniform& uniform) {
    check(vkResetCommandBuffer(f.command, 0), "Nova reset commands");
    VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    check(vkBeginCommandBuffer(f.command, &begin), "Nova begin commands");
    VkClearValue clear{}; clear.color = {{0.012f, 0.020f, 0.027f, 1.0f}};
    VkRenderPassBeginInfo pass{VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO};
    pass.renderPass = c.pass; pass.framebuffer = c.present.buffers[image];
    pass.renderArea.extent = c.present.extent; pass.clearValueCount = 1; pass.pClearValues = &clear;
    vkCmdBeginRenderPass(f.command, &pass, VK_SUBPASS_CONTENTS_INLINE);
    vkCmdBindPipeline(f.command, VK_PIPELINE_BIND_POINT_GRAPHICS, c.pipeline);
    VkViewport viewport{0, 0, float(c.present.extent.width), float(c.present.extent.height), 0, 1};
    VkRect2D scissor{{0, 0}, c.present.extent};
    vkCmdSetViewport(f.command, 0, 1, &viewport);
    vkCmdSetScissor(f.command, 0, 1, &scissor);
    VkDeviceSize offset = 0;
    vkCmdBindVertexBuffers(f.command, 0, 1, &f.vertices, &offset);
    vkCmdBindDescriptorSets(f.command,VK_PIPELINE_BIND_POINT_GRAPHICS,c.layout,0,1,&c.texture.set,0,nullptr);
    vkCmdPushConstants(f.command, c.layout, VK_SHADER_STAGE_VERTEX_BIT, 0, sizeof(uniform), &uniform);
    vkCmdDraw(f.command, geometry.hud_start, 1, 0, 0);
    offset = surface_offset;
    vkCmdBindVertexBuffers(f.command, 0, 1, &f.vertices, &offset);
    vkCmdBindIndexBuffer(f.command, f.vertices, index_offset, VK_INDEX_TYPE_UINT32);
    vkCmdDrawIndexed(f.command, uint32_t(geometry.indices.size()), 1, 0, 0, 0);
    vkCmdBindPipeline(f.command, VK_PIPELINE_BIND_POINT_GRAPHICS, c.stroke_pipeline);
    offset = stroke_offset;
    vkCmdBindVertexBuffers(f.command, 0, 1, &f.vertices, &offset);
    vkCmdDraw(f.command, 6, uint32_t(geometry.strokes.size()), 0, 0);
    vkCmdBindPipeline(f.command, VK_PIPELINE_BIND_POINT_GRAPHICS, c.pipeline);
    offset = 0; vkCmdBindVertexBuffers(f.command, 0, 1, &f.vertices, &offset);
    vkCmdDraw(f.command, uint32_t(geometry.vertices.size()) - geometry.hud_start, 1, geometry.hud_start, 0);
    vkCmdEndRenderPass(f.command);
    check(vkEndCommandBuffer(f.command), "Nova end commands");
}
static void submit(Context& c, Frame& f, uint32_t image) {
    VkPipelineStageFlags wait = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    VkSubmitInfo info{VK_STRUCTURE_TYPE_SUBMIT_INFO};
    info.waitSemaphoreCount = 1; info.pWaitSemaphores = &f.acquired;
    info.pWaitDstStageMask = &wait;
    info.commandBufferCount = 1; info.pCommandBuffers = &f.command;
    info.signalSemaphoreCount = 1; info.pSignalSemaphores = &c.present.finished[image];
    check(vkResetFences(c.device, 1, &f.fence), "Nova reset frame fence");
    check(vkQueueSubmit(c.queue, 1, &info, f.fence), "Nova submit");
    VkPresentInfoKHR present{VK_STRUCTURE_TYPE_PRESENT_INFO_KHR};
    present.waitSemaphoreCount = 1; present.pWaitSemaphores = &c.present.finished[image];
    present.swapchainCount = 1; present.pSwapchains = &c.present.chain; present.pImageIndices = &image;
    VkResult result = vkQueuePresentKHR(c.queue, &present);
    if (result == VK_ERROR_OUT_OF_DATE_KHR || result == VK_SUBOPTIMAL_KHR) c.resized = true;
    else check(result, "Nova present");
}
static void upload(Frame& f, Geometry g) {
    auto copy = [&](size_t offset, const auto& data) {
        if (!data.empty()) std::memcpy(static_cast<char*>(f.mapped) + offset, data.data(), data.size_bytes());
    };
    copy(0, g.vertices); copy(stroke_offset, g.strokes);
    copy(surface_offset, g.surface); copy(index_offset, g.indices);
}
bool draw(Context& c, Geometry geometry, const Uniform& uniform) {
    if (c.closed || c.minimized) return false;
    if (c.resized && !resize(c)) return false;
    Frame& f = c.frames[c.frame];
    VkResult ready = vkGetFenceStatus(c.device, f.fence);
    if (ready == VK_NOT_READY) return false;
    check(ready, "Nova frame fence");
    uint32_t image = 0;
    VkResult acquired = vkAcquireNextImageKHR(c.device, c.present.chain, 0, f.acquired, VK_NULL_HANDLE, &image);
    if (acquired == VK_NOT_READY || acquired == VK_TIMEOUT) return false;
    if (acquired == VK_ERROR_OUT_OF_DATE_KHR) { c.resized = true; return false; }
    if (acquired != VK_SUBOPTIMAL_KHR) check(acquired, "Nova acquire");
    upload(f, geometry);
    auto sized = uniform; sized.viewport[0] = float(c.present.extent.width); sized.viewport[1] = float(c.present.extent.height);
    record(c, f, image, geometry, sized);
    submit(c, f, image);
    c.frame = (c.frame + 1) % c.frames.size();
    return true;
}
}
