using Godot;

namespace NltWorldEngine;

public static class TerrainBuilder
{
    public static MeshInstance3D Build(int seg = 208)
    {
        var st = new SurfaceTool();
        st.Begin(Mesh.PrimitiveType.Triangles);

        const float size = WorldConstants.World;
        float step = size / seg;
        Vector3 Vertex(int i, int j)
        {
            float x = -size / 2f + i * step;
            float z = -size / 2f + j * step;
            return new Vector3(x, WorldGeometry.HeightAt(x, z), z);
        }

        Color ColorAt(float x, float z, float h)
        {
            float slope = WorldGeometry.SlopeAt(x, z);
            float grain = SimulationRng.Fbm(x * 0.06f, z * 0.06f, 3, WorldConstants.Seed + 991);

            // NOTE: Godot C#'s Color(uint) reads the value as 0xRRGGBBAA, so every literal
            // carries an explicit FF alpha byte — without it R is 0x00 and the world turns blue/green.
            Color sand = new(0xc9b48cFF), grass = new(0x5c7444FF), grass2 = new(0x48603aFF),
                  rock = new(0x7b7468FF), dark = new(0x4c4740FF);

            Color c;
            if (h < WorldConstants.Water - 2.6f) c = dark;
            else if (h < WorldConstants.Water + 1.5f) c = sand;
            else
            {
                c = grass.Lerp(grass2, grain);
                c = c.Lerp(rock, Mathx.Smoothstep(0.28f, 0.72f, slope));
                c = c.Lerp(sand, Mathx.Smoothstep(2.4f, 0.9f, h) * 0.25f);
                c *= 0.86f + grain * 0.30f;
            }
            float shade = 0.94f + SimulationRng.Fbm(x * 0.012f, z * 0.012f, 2, WorldConstants.Seed + 77) * 0.14f;
            return c * shade;
        }

        for (int j = 0; j < seg; j++)
        for (int i = 0; i < seg; i++)
        {
            Vector3 a = Vertex(i, j), b = Vertex(i + 1, j), c = Vertex(i + 1, j + 1), d = Vertex(i, j + 1);
            // two triangles: a, d, c  /  a, c, b  (winding for upward faces)
            AddTri(st, a, d, c);
            AddTri(st, a, c, b);
        }

        void AddTri(SurfaceTool s, Vector3 p0, Vector3 p1, Vector3 p2)
        {
            s.SetColor(ColorAt(p0.X, p0.Z, p0.Y)); s.AddVertex(p0);
            s.SetColor(ColorAt(p1.X, p1.Z, p1.Y)); s.AddVertex(p1);
            s.SetColor(ColorAt(p2.X, p2.Z, p2.Y)); s.AddVertex(p2);
        }

        st.GenerateNormals();
        // No UVs on this mesh — tangents not needed (vertex colour only).
        var mat = new StandardMaterial3D
        {
            VertexColorUseAsAlbedo = true,
            Roughness = 0.97f,
            Metallic = 0f,
        };
        st.SetMaterial(mat);

        return new MeshInstance3D { Mesh = st.Commit(), CastShadow = GeometryInstance3D.ShadowCastingSetting.Off };
    }
}
