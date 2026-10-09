# Test script for the NLTWorldUtils GDExtension plugin.
# This demonstrates that the NLTWorldUtils class is registered
# and accessible from GDScript.

extends Node

func _ready():
	# --- Test: noise_2d ---
	var noise_val = NLTWorldUtils.noise_2d(10.5, 20.3, 42)
	print("noise_2d(10.5, 20.3, 42) = ", noise_val)  # In range [-1, 1]

	# --- Test: noise_3d ---
	var noise3d = NLTWorldUtils.noise_3d(10.5, 20.3, 5.0, 42)
	print("noise_3d(10.5, 20.3, 5.0, 42) = ", noise3d)

	# --- Test: fbm_2d ---
	var fbm = NLTWorldUtils.fbm_2d(10.5, 20.3, 42, 4, 0.5)
	print("fbm_2d(10.5, 20.3, 42, 4, 0.5) = ", fbm)

	# --- Test: seeded_randomf ---
	var seeded_randf = NLTWorldUtils.seeded_randomf(12345)
	print("seeded_randomf(12345) = ", seeded_randf)  # In [0, 1)

	# --- Test: seeded_randomi ---
	var seeded_randi = NLTWorldUtils.seeded_randomi(12345, 100)
	print("seeded_randomi(12345, 100) = ", seeded_randi)  # In [0, 100)

	# --- Test: lerp ---
	var lerped = NLTWorldUtils.lerp(0.0, 100.0, 0.5)
	print("lerp(0.0, 100.0, 0.5) = ", lerped)  # Should be 50

	# --- Test: smooth_step ---
	var smoothed = NLTWorldUtils.smooth_step(0.0, 100.0, 0.5)
	print("smooth_step(0.0, 100.0, 0.5) = ", smoothed)  # Should be 50

	# --- Test: hash_32 ---
	var hash_val = NLTWorldUtils.hash_32(42, 7)
	print("hash_32(42, 7) = ", hash_val)

	print("NLTWorldUtils plugin is working correctly!")
