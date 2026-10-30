#version 450
layout(location=0) in vec4 position;
layout(location=1) in vec4 color;
layout(location=0) out vec4 vertex_color;
layout(location=1) out vec3 world;
layout(location=2) flat out int material;
layout(push_constant) uniform Transform { mat4 matrix; } transform;
void main() {
    gl_Position = position.w < 0.0 ? vec4(position.xyz, 1.0) : transform.matrix * vec4(position.xyz, 1.0);
    vertex_color = color;
    world = position.xyz;
    material = position.w == 2.0 ? 1 : (position.w == -2.0 ? 2 : 0);
}
