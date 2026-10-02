using Godot;

namespace NltWorldEngine;

public static class SkyBuilder
{
    public static MeshInstance3D Build()
    {
        var shader = new Shader
        {
            Code = @"
shader_type spatial;
render_mode unshaded, cull_front;

uniform vec3 u_top : source_color;
uniform vec3 u_horizon : source_color;
uniform vec3 u_ground : source_color;
uniform vec3 u_sun_color : source_color;
uniform vec3 u_sun_dir;

varying vec3 v_dir;
void vertex() {
    v_dir = VERTEX;
    vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
    POSITION = PROJECTION_MATRIX * mv;
}
void fragment() {
    vec3 d = normalize(v_dir);
    float h = d.y;
    vec3 col;
    if (h >= 0.0) col = mix(u_horizon, u_top, pow(clamp(h, 0.0, 1.0), 0.42));
    else col = mix(u_horizon, u_ground, pow(clamp(-h, 0.0, 1.0), 0.35));
    float sd = max(dot(d, normalize(u_sun_dir)), 0.0);
    col += u_sun_color * pow(sd, 900.0) * 6.0;
    col += u_sun_color * pow(sd, 14.0) * 0.35;
    col += u_sun_color * pow(sd, 3.0) * 0.07;
    ALBEDO = col;
}
"
        };
        var mat = new ShaderMaterial { Shader = shader };
        mat.SetShaderParameter("u_top", new Color(0x2f6ea8));
        mat.SetShaderParameter("u_horizon", new Color(0xc3d4dd));
        mat.SetShaderParameter("u_ground", new Color(0x2a2b28));
        mat.SetShaderParameter("u_sun_color", new Color(0xfff2d6));
        mat.SetShaderParameter("u_sun_dir", new Vector3(0.5f, 0.7f, 0.4f));

        return new MeshInstance3D
        {
            Mesh = new SphereMesh { Radius = 1500f, IsHemisphere = false, RadialSegments = 24, Rings = 16 },
            MaterialOverride = mat,
        };
    }
}
