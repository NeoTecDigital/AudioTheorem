#version 450
layout(location=0) in vec4 a;
layout(location=1) in vec4 b;
layout(location=2) in vec4 color;
layout(location=0) out vec4 vertex_color;
layout(location=1) noperspective out vec2 local;
layout(location=2) flat out vec2 shape;
layout(push_constant) uniform Transform { mat4 matrix; vec4 viewport; } transform;
void main() {
    vec4 p = transform.matrix * vec4(a.xyz, 1.0);
    vec4 q = transform.matrix * vec4(b.xyz, 1.0);
    if (b.w < 0.0) { p = vec4(a.xyz, 1.0); q = vec4(b.xyz, 1.0); }
    vertex_color = color;
    if (p.w <= 0.001 || q.w <= 0.001) { gl_Position = vec4(2,2,2,1); local=vec2(0); shape=vec2(0); return; }
    vec2 viewport = max(transform.viewport.xy, vec2(1));
    vec2 pa = p.xy / p.w * viewport * 0.5;
    vec2 pb = q.xy / q.w * viewport * 0.5;
    float len = max(length(pb-pa), 0.001);
    vec2 direction = (pb-pa) / len;
    vec2 normal = vec2(-direction.y, direction.x);
    float radius = max(a.w * 0.5, 0.5);
    float edge = radius + 1.0;
    const vec2 corners[6] = vec2[6](vec2(0,-1), vec2(1,-1), vec2(1,1), vec2(0,-1), vec2(1,1), vec2(0,1));
    vec2 corner = corners[gl_VertexIndex];
    local = vec2(mix(-edge, len+edge, corner.x), corner.y*edge);
    shape = vec2(len, radius);
    vec2 pixel = pa + direction*local.x + normal*local.y;
    gl_Position = vec4(pixel / viewport * 2.0, 0.0, 1.0);
}
