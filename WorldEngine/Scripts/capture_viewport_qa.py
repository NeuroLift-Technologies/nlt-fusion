#!/usr/bin/env python3
"""
CaptureViewport QA Ritual — Workplace_Level
==========================================
Captures viewport screenshots from 4 human-eye-height observation cameras
in the UE 5.8 WorldEngine Workplace_Level for QA verification.

Human Scale: 160cm (1.6m) eye height
Camera Positions: 4 corners of the play area, looking inward toward center
  - NE Cam: (+1585, +1185, 160)  yaw=225° → SW
  - NW Cam: (-1585, +1185, 160)  yaw=315° → SE
  - SE Cam: (+1585, -1185, 160)  yaw=135° → NW
  - SW Cam: (-1585, -1185, 160)  yaw=45°  → NE

Usage:
    python capture_viewport_qa.py [--output-dir ./QA_Screenshots] [--res 1920x1080]
    python capture_viewport_qa.py --list-cameras
    python capture_viewport_qa.py --camera ObservationCam_NE

Requires: UE 5.8+ with PythonEditorScriptPlugin
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    import unreal
except ImportError:
    print("ERROR: This script must be run inside Unreal Engine's Python environment.")
    print("       Use 'Execute Python Script' in the Editor or run via uecli.")
    sys.exit(1)


# ─── Configuration ───────────────────────────────────────────────────────────

PROJECT_PATH = "D:/nlt-repos/nlt-fusion/WorldEngine"
LEVEL_PATH = "/Game/Scenarios/Levels/Workplace_Level"
OUTPUT_DIR_DEFAULT = os.path.join(PROJECT_PATH, "Saved", "QA_Screenshots", "Workplace")

# Human-scale observation cameras (160cm eye height)
OBSERVATION_CAMERAS = {
    "ObservationCam_NE": {
        "location": [1585.0, 1185.0, 160.0],
        "rotation": [0.0, 0.0, 225.0],  # pitch, roll, yaw
        "fov": 90.0,
        "description": "North-East corner, facing South-West toward center",
    },
    "ObservationCam_NW": {
        "location": [-1585.0, 1185.0, 160.0],
        "rotation": [0.0, 0.0, 315.0],
        "fov": 90.0,
        "description": "North-West corner, facing South-East toward center",
    },
    "ObservationCam_SE": {
        "location": [1585.0, -1185.0, 160.0],
        "rotation": [0.0, 0.0, 135.0],
        "fov": 90.0,
        "description": "South-East corner, facing North-West toward center",
    },
    "ObservationCam_SW": {
        "location": [-1585.0, -1185.0, 160.0],
        "rotation": [0.0, 0.0, 45.0],
        "fov": 90.0,
        "description": "South-West corner, facing North-East toward center",
    },
}

# Play area bounds (from measured static meshes)
PLAY_AREA_BOUNDS = {
    "min": [-1600.0, -1200.0, 0.0],
    "max": [1600.0, 1200.0, 350.0],
}

# Screenshot resolution presets
RESOLUTION_PRESETS = {
    "720p": (1280, 720),
    "1080p": (1920, 1080),
    "1440p": (2560, 1440),
    "4k": (3840, 2160),
}


# ─── Core Functions ──────────────────────────────────────────────────────────

def get_camera_actor(camera_name: str):
    """Find an existing CameraActor in the current level by label."""
    world = unreal.EditorLevelLibrary.get_editor_world()
    actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.CameraActor)
    for actor in actors:
        label = actor.get_actor_label()
        if label == camera_name:
            return actor
    return None


def create_camera_actor(camera_name: str, config: dict):
    """Create a new CameraActor at the specified transform."""
    location = unreal.Vector(*config["location"])
    rotation = unreal.Rotator(*config["rotation"])

    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.CameraActor, location, rotation
    )
    if actor is None:
        raise RuntimeError(f"Failed to spawn CameraActor: {camera_name}")

    actor.set_actor_label(camera_name)

    # Set FOV if supported
    camera_component = actor.get_component_by_class(unreal.CameraComponent)
    if camera_component:
        camera_component.set_field_of_view(config.get("fov", 90.0))

    return actor


def ensure_camera_exists(camera_name: str, config: dict):
    """Find existing camera or create it if missing."""
    actor = get_camera_actor(camera_name)
    if actor:
        print(f"  [FOUND] {camera_name}")
        return actor
    print(f"  [CREATE] {camera_name}")
    return create_camera_actor(camera_name, config)


def capture_viewport_from_camera(camera_name: str, output_path: str, resolution: tuple):
    """
    Set the active viewport to a camera actor and capture a screenshot.
    Uses UE's built-in screenshot command for high-quality output.
    """
    actor = get_camera_actor(camera_name)
    if actor is None:
        print(f"  [SKIP] Camera not found: {camera_name}")
        return False

    # Get the viewport world via subsystem
    viewport_subsystem = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    if viewport_subsystem is None:
        viewport_subsystem = unreal.get_editor_subsystem(unreal.ViewportSubsystem)

    # Use the ViewportSubsystem to set camera
    if viewport_subsystem:
        viewport_subsystem.set_viewport_camera_location(
            unreal.Vector(*OBSERVATION_CAMERAS[camera_name]["location"])
        )
        viewport_subsystem.set_viewport_camera_rotation(
            unreal.Rotator(*OBSERVATION_CAMERAS[camera_name]["rotation"])
        )

    # Alternative: use EditorLevelLibrary viewport commands
    # Set viewport to this camera's POV
    viewport_client = unreal.get_editor_subsystem(unreal.VIEWPORT)
    if viewport_client:
        # Use console command for viewport capture
        width, height = resolution
        cmd = f"Shot ResX={width} ResY={height}"
        unreal.SystemLibrary.execute_console_command(
            unreal.EditorLevelLibrary.get_editor_world(), cmd
        )

    # Take high-res screenshot via console command
    cmd = f"HighResShot {width}x{height}"
    unreal.SystemLibrary.execute_console_command(
        unreal.EditorLevelLibrary.get_editor_world(), cmd
    )

    print(f"  [CAPTURED] {camera_name} → {output_path}")
    return True


def capture_viewport_direct(camera_name: str, output_path: str, resolution: tuple):
    """
    Direct viewport capture using EditorViewportClient.
    More reliable than console commands in headless/automated contexts.
    """
    actor = get_camera_actor(camera_name)
    if actor is None:
        print(f"  [SKIP] Camera not found: {camera_name}")
        return False

    # Get viewport client
    viewport_client = unreal.get_editor_subsystem(unreal.EditorViewportClient)
    if viewport_client is None:
        # Fallback: use the first active viewport
        viewport_clients = unreal.get_editor_subsystem(
            unreal.VIEWPORT
        )
        if viewport_clients:
            viewport_client = viewport_clients.get_active_viewport_client()

    if viewport_client is None:
        print(f"  [ERROR] No viewport client available")
        return False

    # Set viewport camera to match our actor
    cam_location = actor.get_actor_location()
    cam_rotation = actor.get_actor_rotation()

    viewport_client.set_view_location(cam_location)
    viewport_client.set_view_rotation(cam_rotation)

    # Set ortho or perspective mode
    if viewport_client.is_ortho():
        viewport_client.set_view_mode(unreal.LevelViewportSettings.VMI_Lit)

    # Force viewport update
    viewport_client.draw()

    # Capture screenshot
    width, height = resolution
    screenshot_path = unreal.AutomationLibrary.take_high_res_screenshot(
        width, height, camera_name + ".png"
    )

    print(f"  [CAPTURED] {camera_name} → {screenshot_path}")
    return True


def capture_via_console(camera_name: str, output_path: str, resolution: tuple):
    """
    Capture using Unreal console commands — most compatible approach.
    Sets viewport location/rotation then triggers HighResShot.
    """
    actor = get_camera_actor(camera_name)
    if actor is None:
        print(f"  [SKIP] Camera not found: {camera_name}")
        return False

    loc = actor.get_actor_location()
    rot = actor.get_actor_rotation()

    world = unreal.EditorLevelLibrary.get_editor_world()

    # Set viewport to camera position
    unreal.SystemLibrary.execute_console_command(
        world, f"SetViewLocation {loc.x} {loc.y} {loc.z}"
    )
    unreal.SystemLibrary.execute_console_command(
        world, f"SetViewRotation {rot.pitch} {rot.yaw} {rot.roll}"
    )

    # Small delay for viewport to update
    time.sleep(0.5)

    # Trigger high-res screenshot
    width, height = resolution
    unreal.SystemLibrary.execute_console_command(
        world, f"HighResShot {width}x{height}"
    )

    print(f"  [CAPTURED] {camera_name} ({width}x{height})")
    return True


def run_qa_ritual(
    output_dir: str = OUTPUT_DIR_DEFAULT,
    resolution: tuple = (1920, 1080),
    cameras: list = None,
    method: str = "console",
):
    """
    Run the full CaptureViewport QA ritual.
    Ensures all 4 cameras exist, then captures from each.
    """
    print("=" * 60)
    print("  CaptureViewport QA Ritual — Workplace_Level")
    print(f"  Resolution: {resolution[0]}x{resolution[1]}")
    print(f"  Output: {output_dir}")
    print(f"  Method: {method}")
    print("=" * 60)

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)

    # Load the level if not already loaded
    current_level = unreal.EditorLevelLibrary.get_current_level_name()
    if current_level != "Workplace_Level":
        print(f"\n[LOAD] Loading Workplace_Level...")
        unreal.EditorLevelLibrary.load_level(LEVEL_PATH)
        time.sleep(1)

    # Determine which cameras to capture
    target_cameras = cameras or list(OBSERVATION_CAMERAS.keys())

    # Ensure all cameras exist
    print("\n[CAMERAS] Ensuring observation cameras exist...")
    for cam_name in target_cameras:
        config = OBSERVATION_CAMERAS[cam_name]
        ensure_camera_exists(cam_name, config)

    # Capture from each camera
    print(f"\n[CAPTURE] Capturing {len(target_cameras)} viewports...")
    results = {}
    for cam_name in target_cameras or []:
        print(f"\n  → {cam_name}")
        config = OBSERVATION_CAMERAS[cam_name]
        print(f"    Location: {config['location']}")
        print(f"    Rotation: {config['rotation']}")
        print(f"    FOV: {config['fov']}°")
        print(f"    {config['description']}")

        if method == "console":
            success = capture_via_console(cam_name, output_dir, resolution)
        elif method == "direct":
            success = capture_viewport_direct(cam_name, output_dir, resolution)
        else:
            success = capture_viewport_from_camera(cam_name, output_dir, resolution)

        results[cam_name] = success

    # Summary
    print("\n" + "=" * 60)
    print("  QA Ritual Complete")
    print("=" * 60)
    for cam_name, success in results.items():
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"  {status}  {cam_name}")

    passed = sum(1 for s in results.values() if s)
    total = len(results)
    print(f"\n  Result: {passed}/{total} captures successful")

    # Write manifest
    manifest_path = os.path.join(output_dir, "qa_manifest.json")
    manifest = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "level": LEVEL_PATH,
        "resolution": f"{resolution[0]}x{resolution[1]}",
        "method": method,
        "cameras": {
            cam: {
                "success": results.get(cam, False),
                "location": OBSERVATION_CAMERAS[cam]["location"],
                "rotation": OBSERVATION_CAMERAS[cam]["rotation"],
                "fov": OBSERVATION_CAMERAS[cam]["fov"],
            }
            for cam in target_cameras
        },
        "play_area_bounds": PLAY_AREA_BOUNDS,
    }
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\n  Manifest: {manifest_path}")

    return results


# ─── CLI Entry Point ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="CaptureViewport QA Ritual for Workplace_Level"
    )
    parser.add_argument(
        "--output-dir",
        default=OUTPUT_DIR_DEFAULT,
        help="Directory to save screenshots",
    )
    parser.add_argument(
        "--res",
        default="1080p",
        choices=list(RESOLUTION_PRESETS.keys()),
        help="Screenshot resolution preset",
    )
    parser.add_argument(
        "--resolution",
        default=None,
        help="Custom resolution WxH (overrides --res)",
    )
    parser.add_argument(
        "--camera",
        default=None,
        help="Capture only a single camera by name",
    )
    parser.add_argument(
        "--list-cameras",
        action="store_true",
        help="List all configured observation cameras",
    )
    parser.add_argument(
        "--method",
        default="console",
        choices=["console", "direct", "viewport"],
        help="Capture method",
    )

    args = parser.parse_args()

    if args.list_cameras:
        print("Configured Observation Cameras (160cm eye height):")
        for name, config in OBSERVATION_CAMERAS.items():
            print(f"\n  {name}:")
            print(f"    Location: {config['location']}")
            print(f"    Rotation: {config['rotation']}")
            print(f"    FOV: {config['fov']}°")
            print(f"    {config['description']}")
        return

    # Parse resolution
    if args.resolution:
        w, h = args.resolution.split("x")
        resolution = (int(w), int(h))
    else:
        resolution = RESOLUTION_PRESETS[args.res]

    target_cameras: list[str] = [args.camera] if args.camera else list(OBSERVATION_CAMERAS.keys())

    run_qa_ritual(
        output_dir=args.output_dir,
        resolution=resolution,
        cameras=target_cameras,
        method=args.method,
    )


if __name__ == "__main__":
    main()
