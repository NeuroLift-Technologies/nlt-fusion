using Godot;

namespace NltWorldEngine;

public static class WaterBuilder
{
    public static MeshInstance3D Build()
    {
        var shader = new Shader
        {
            Code = @"
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, unshaded;

uniform float u_time;
uniform vec3 u_deep : source_color;
uniform vec3 u_shallow : source_color;
uniform vec3 u_sky : source_color;
uniform vec3 u_sun_color : source_color;
uniform vec3 u_sun_dir;
uniform float u_fog_density;

float wave(vec2 p, vec2 dir, float freq, float speed) {
    return sin(dot(p, dir) * freq + u_time * speed);
}
float waves(vec2 p) {
    float s = 0.0;
    s += wave(p, normalize(vec2( 1.00, 0.32)), 0.052, 1.15) * 0.30;
    s += wave(p, normalize(vec2(-0.42, 1.00)), 0.081, 0.95) * 0.17;
    s += wave(p, normalize(vec2( 0.72,-0.68)), 0.173, 1.70) * 0.08;
    s += wave(p, normalize(vec2(-0.86,-0.51)), 0.290, 2.35) * 0.04;
    return s;
}
varying vec3 v_world;
void vertex() {
    v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    VERTEX.y += waves(v_world.xz) * 0.5;
    v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
    vec2 p = v_world.xz;
    float h = waves(p);
    float e = 1.6;
    float hx = waves(p + vec2(e, 0.0)) - waves(p - vec2(e, 0.0));
    float hz = waves(p + vec2(0.0, e)) - waves(p - vec2(0.0, e));
    vec3 N = normalize(vec3(-hx * 0.85, 1.0, -hz * 0.85));
    vec3 V = normalize(CAMERA_POSITION_WORLD - v_world);
    vec3 L = normalize(u_sun_dir);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.2);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 180.0);
    float glitter = pow(max(dot(reflect(-L, N), V), 0.0), 28.0) * 0.14;
    vec3 col = mix(u_deep, u_shallow, clamp(h * 0.35 + 0.5, 0.0, 1.0));
    col = mix(col, u_sky, clamp(fres * 0.85, 0.0, 1.0));
    col += u_sun_color * (spec * 1.3 + glitter);
    ALBEDO = col;
    ALPHA = mix(0.86, 0.97, fres);
}
"
        };
        var mat = new ShaderMaterial { Shader = shader };
        mat.SetShaderParameter("u_deep", new Color(0x16323d));
        mat.SetShaderParameter("u_shallow", new Color(0x2f6f74));
        mat.SetShaderParameter("u_sky", new Color(0xc3d4dd));
        mat.SetShaderParameter("u_sun_color", new Color(0xfff2d6));
        mat.SetShaderParameter("u_sun_dir", new Vector3(0.5f, 0.7f, 0.4f));

        var mesh = new MeshInstance3D
        {
            Mesh = new PlaneMesh { Size = new Vector2(2600, 2600) },
            MaterialOverride = mat,
            Position = new Vector3(0, WorldConstants.Water, 0),
        };
        mesh.SetMeta("water_mat", mat);
        return mesh;
    }
}
