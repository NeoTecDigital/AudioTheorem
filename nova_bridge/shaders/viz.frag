#version 450

layout(location = 0) in vec3 fragColor;
layout(location = 1) in vec3 fragPos;
layout(location = 2) in vec3 fragNormal;

layout(location = 0) out vec4 outColor;

layout(binding = 0) uniform UBO {
    mat4 model;
    mat4 view;
    mat4 proj;
    vec4 params; // x: time, y: bass_pulse, z: mode, w: theme
} ubo;

void main() {
    if (fragNormal.z < -90.0) {
        // Pure unlit emissive color for HUD elements
        outColor = vec4(fragColor, 1.0);
        return;
    }

    vec3 lightDir = normalize(vec3(0.4, 0.9, 0.6));
    vec3 norm = normalize(fragNormal);
    float diff = max(dot(norm, lightDir), 0.0);
    vec3 ambient = vec3(0.32);

    vec3 viewDir = normalize(-fragPos);
    vec3 reflectDir = reflect(-lightDir, norm);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);

    float pulse = ubo.params.y * 0.45;
    vec3 lit = (ambient + diff * 0.7 + spec * 0.35) * fragColor + fragColor * pulse;

    outColor = vec4(lit, 1.0);
}
