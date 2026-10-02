# Post-Processing Assets

Imported free UE5 post-processing assets from Epic Fab:

| Asset | Fab Listing |
|-------|-------------|
| Post Process LUTS (110 LUTs) | https://fab.com/listings/b0dfa51e-f2bc-49ce-aa6c-e9622d21c5a4 |
| Night Cinematic Environment Presets | https://fab.com/listings/36c0929c-9aa1-493e-af90-9523c8f7c533 |

## Usage

- **2D LUT textures** → assigned to `PostProcessVolumeActor::ColorGradingLUT`
  (consumed via `ColorGradingLUTMaterial` post-process blendable)
- **Night presets** → different SkyLight/SkyDome + LUT combinations for night
  weather conditions

## Integration

```cpp
// Via Blueprint or C++:
Atmosphere->SetColorGradingLUT(MyLUTTexture, MyLUTMaterial);
```

## Naming Convention

```
T_LUT_Filmic_01        (Texture2D)
T_LUT_WarmCinematic_01 (Texture2D)
T_LUT_NightMood_01     (Texture2D)
M_PP_LUT_Base           (Material — samples LUT_Texture parameter)
MI_PP_LUT_Filmic_01     (MaterialInstance)
```
