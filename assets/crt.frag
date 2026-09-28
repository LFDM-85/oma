#version 440
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float curvature;
};
layout(binding = 1) uniform sampler2D source;
void main() {
    vec2 p = qt_TexCoord0 * 2.0 - 1.0;
    vec2 curved = p * (1.0 + curvature * p.yx * p.yx);
    vec2 uv = curved * 0.5 + 0.5;
    // Quiet glass shading only: no scanlines, noise, or color separation.
    float shade = 1.0 - 0.08 * dot(p, p);
    float edge = 1.0 - smoothstep(0.995, 1.0, max(abs(curved.x), abs(curved.y)));
    vec4 color = texture(source, clamp(uv, vec2(0.0), vec2(1.0)));
    fragColor = vec4(color.rgb * shade * edge, color.a) * qt_Opacity;
}
