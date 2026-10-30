#version 450
layout(location=0) in vec4 vertex_color;
layout(location=1) in vec3 world;
layout(location=2) flat in int material;
layout(location=0) out vec4 color;
layout(set=0,binding=0) uniform sampler2D artwork;
void main() {
    color = vertex_color;
    if (material == 2) color = texture(artwork, vertex_color.xy);
    if (material == 1) {
        vec3 n = cross(dFdx(world), dFdy(world));
        n /= max(length(n), 0.000001);
        float light = 0.64 + 0.36 * abs(dot(n, normalize(vec3(-0.4, 1.0, 0.3))));
        color.rgb *= light;
    }
}
