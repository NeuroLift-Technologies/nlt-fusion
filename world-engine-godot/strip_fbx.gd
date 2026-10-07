extends SceneTree

const LEVELS = ["Workplace", "Personal", "Social", "Academic"]

func _init():
    for level in LEVELS:
        var path := "res://assets/levels/%s_Level.fbx" % level
        var packed: PackedScene = load(path)
        if packed == null:
            push_error("failed to load %s" % path)
            continue
        var level_root: Node = packed.instantiate()
        var stripped := _strip_sky_sphere(level_root)
        var out := PackedScene.new()
        out.pack(level_root)
        var dest := "res://assets/levels/%s_Level.tscn" % level
        ResourceSaver.save(out, dest)
        print("stripped %d sky sphere nodes -> %s" % [stripped, dest])
    quit()

func _strip_sky_sphere(node: Node) -> int:
    var count := 0
    for child in node.get_children():
        count += _strip_sky_sphere(child)
    if node.name.contains("SkySphere"):
        node.get_parent().remove_child(node)
        node.queue_free()
        return 1
    return count
