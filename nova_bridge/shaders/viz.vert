#version 450

layout(location = 0) in vec3 inPosition;
layout(location = 1) in vec3 inColor;
layout(location = 2) in vec3 inNormal;

layout(location = 0) out vec3 fragColor;
layout(location = 1) out vec3 fragPos;
layout(location = 2) out vec3 fragNormal;

layout(binding = 0) uniform UBO {
    mat4 model;
    mat4 view;
    mat4 proj;
    vec4 params; // x: time, y: bass_pulse, z: mode, w: theme
} ubo;

void main() {
    if (inNormal.z < -90.0) {
        // 2D HUD element in normalized screen coordinates [-1.0, 1.0]
        gl_Position = vec4(inPosition.xy, 0.0001, 1.0);
        fragColor = inColor;
        fragPos = inPosition;
        fragNormal = inNormal;
    } else {
        vec4 worldPos = ubo.model * vec4(inPosition, 1.0);
        gl_Position = ubo.proj * ubo.view * worldPos;
        fragColor = inColor;
        fragPos = worldPos.xyz;
        fragNormal = mat3(ubo.model) * inNormal;
    }
}
