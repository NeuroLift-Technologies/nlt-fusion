using Godot;

namespace NltWorldEngine;

/// <summary>
/// A doorway between the open world and an interior (RENDERER-PLAN.md B.3 / C.2).
///
/// Today it is the spectator's way in and out: the observer clicks a door, or presses <c>E</c>.
/// <see cref="SceneId"/> is empty for the return door inside an interior. <see cref="Facing"/> is the
/// doorway's outward axis and <see cref="EntryPoint"/> is where an arriving body would stand; both are
/// kept so the same data serves residents when B.2 lands rather than being rewritten then.
/// </summary>
public sealed record Portal(string Kind, string Label, string SceneId, Vector3 Position, Vector3 Facing)
{
    /// <summary>Where an arriving body stands: just outside the door, on the doorway's own axis.</summary>
    public Vector3 EntryPoint => Position + Facing * 1.6f;
}

/// <summary>The visual affordance for a <see cref="Portal"/>: an emissive arch framing the door, with
/// a plain word above it. Colour reinforces the kind, but the word carries it (contract §4.1).</summary>
public static class PortalMarker
{
    public static Node3D Build(string label, Color colour)
    {
        var root = new Node3D();
        var mat = new StandardMaterial3D
        {
            AlbedoColor = colour,
            EmissionEnabled = true,
            Emission = colour,
            EmissionEnergyMultiplier = 1.4f,
            Roughness = 0.4f,
        };

        root.AddChild(Post(mat, -0.78f));
        root.AddChild(Post(mat, 0.78f));
        root.AddChild(new MeshInstance3D
        {
            Mesh = new BoxMesh { Size = new Vector3(1.72f, 0.16f, 0.16f) },
            MaterialOverride = mat,
            Position = new Vector3(0f, 2.32f, 0f),
        });
        root.AddChild(new Label3D
        {
            Text = label,
            Position = new Vector3(0f, 2.78f, 0f),
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
            FontSize = 48,
            PixelSize = 0.006f,
            Modulate = colour,
            OutlineModulate = new Color(0f, 0f, 0f, 0.85f),
            OutlineSize = 10,
        });
        return root;
    }

    private static MeshInstance3D Post(Material mat, float x) => new()
    {
        Mesh = new BoxMesh { Size = new Vector3(0.16f, 2.3f, 0.16f) },
        MaterialOverride = mat,
        Position = new Vector3(x, 1.15f, 0f),
    };
}