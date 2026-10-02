#!/usr/bin/env python3
"""
Generate placeholder WAV files for Workplace soundscape beds.
Optimized for speed: shorter loops (4s), simpler synthesis.

Output: 4 WAV files in Content/Audio/Soundscape/Workplace/
"""

import wave
import struct
import math
import os
import random

SAMPLE_RATE = 48000
BITS_PER_SAMPLE = 16
NUM_CHANNELS = 1
DURATION_SECONDS = 4  # 4-second loops
MAX_AMPLITUDE = 32767 * 0.5  # 50% amplitude

def write_wav(filename, samples):
    """Write mono 16-bit PCM WAV file."""
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(NUM_CHANNELS)
        wf.setsampwidth(BITS_PER_SAMPLE // 8)
        wf.setframerate(SAMPLE_RATE)
        pcm_data = b''
        for s in samples:
            clamped = max(-1.0, min(1.0, s))
            pcm_data += struct.pack('<h', int(clamped * MAX_AMPLITUDE))
        wf.writeframes(pcm_data)
    print(f"  Written: {filename} ({len(samples)} samples, {DURATION_SECONDS}s)")

def generate_hvac_hum():
    """Low-frequency mechanical drone: 60Hz + 120Hz."""
    samples = []
    for i in range(SAMPLE_RATE * DURATION_SECONDS):
        t = i / SAMPLE_RATE
        hum = 0.6 * math.sin(2 * math.pi * 60 * t)
        hum += 0.3 * math.sin(2 * math.pi * 120 * t)
        hum += 0.1 * math.sin(2 * math.pi * 180 * t)
        mod = 1.0 + 0.05 * math.sin(2 * math.pi * 0.1 * t)
        samples.append(hum * mod * 0.4)
    return samples

def generate_fridge_murmur():
    """Gentle intermittent hum: 100Hz + slow cycling."""
    samples = []
    for i in range(SAMPLE_RATE * DURATION_SECONDS):
        t = i / SAMPLE_RATE
        hum = 0.3 * math.sin(2 * math.pi * 100 * t)
        cycle_pos = t % 4.0
        if cycle_pos < 3.0:
            ramp = min(1.0, cycle_pos / 0.5, (3.0 - cycle_pos) / 0.5)
            hum *= ramp
        else:
            hum *= 0.05
        samples.append(hum * 0.35)
    return samples

def generate_clock_tick():
    """Rhythmic ticking: 1Hz tick with 2kHz decay."""
    samples = []
    for i in range(SAMPLE_RATE * DURATION_SECONDS):
        t = i / SAMPLE_RATE
        tick_phase = t % 1.0
        if tick_phase < 0.01:
            decay = 1.0 - (tick_phase / 0.01)
            tick = math.sin(2 * math.pi * 2000 * t) * decay * 0.5
            samples.append(tick * 0.3)
        else:
            samples.append(0.0)
    return samples

def generate_distant_murmur():
    """Background noise with amplitude modulation."""
    samples = []
    random.seed(456)
    for i in range(SAMPLE_RATE * DURATION_SECONDS):
        t = i / SAMPLE_RATE
        # Simple white noise with slow modulation
        noise = random.uniform(-1, 1) * 0.1
        mod = 0.7 + 0.3 * math.sin(2 * math.pi * 0.25 * t)
        samples.append(noise * mod)
    return samples

def main():
    base_dir = "D:/nlt-repos/nlt-fusion/WorldEngine/Content/Audio/Soundscape/Workplace"
    os.makedirs(base_dir, exist_ok=True)
    
    print("Generating Workplace soundscape WAV files...")
    
    print("1. HVAC Hum")
    write_wav(os.path.join(base_dir, "HVAC_Hum.wav"), generate_hvac_hum())
    
    print("2. Fridge Murmur")
    write_wav(os.path.join(base_dir, "Fridge_Murmur.wav"), generate_fridge_murmur())
    
    print("3. Clock Tick")
    write_wav(os.path.join(base_dir, "Clock_Tick.wav"), generate_clock_tick())
    
    print("4. Distant Murmur")
    write_wav(os.path.join(base_dir, "Distant_Murmur.wav"), generate_distant_murmur())
    
    print(f"\nDone! Files in: {base_dir}")

if __name__ == "__main__":
    main()
