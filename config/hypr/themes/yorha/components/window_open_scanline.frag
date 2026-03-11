#version 300 es

precision highp float;
in vec2 v_texcoord;
uniform sampler2D tex;
uniform vec2 fullSize;
layout(location = 0) out vec4 fragColor;

float hash12(vec2 value) {
    return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

float edge_sign(vec2 pointA, vec2 pointB, vec2 pointC) {
    return (pointA.x - pointC.x) * (pointB.y - pointC.y)
        - (pointB.x - pointC.x) * (pointA.y - pointC.y);
}

bool point_in_triangle(vec2 point, vec2 vertexA, vec2 vertexB, vec2 vertexC) {
    float d1 = edge_sign(point, vertexA, vertexB);
    float d2 = edge_sign(point, vertexB, vertexC);
    float d3 = edge_sign(point, vertexC, vertexA);
    bool hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
    bool hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
    return !(hasNeg && hasPos);
}

__ANIMATION_DECLARATIONS__

void main() {
    vec4 pixColor = texture(tex, v_texcoord);
    vec3 scanTint = vec3(0.282353, 0.274510, 0.239216);

__ANIMATION_LOGIC__

    fragColor = pixColor;
}
