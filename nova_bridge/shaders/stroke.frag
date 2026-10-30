#version 450
layout(location=0) in vec4 vertex_color;
layout(location=1) noperspective in vec2 local;
layout(location=2) flat in vec2 shape;
layout(location=0) out vec4 output_color;
void main() {
    float distance = length(vec2(local.x-clamp(local.x,0.0,shape.x),local.y));
    float coverage = 1.0-smoothstep(shape.y-0.6,shape.y+0.6,distance);
    output_color = vec4(vertex_color.rgb,vertex_color.a*coverage);
}
