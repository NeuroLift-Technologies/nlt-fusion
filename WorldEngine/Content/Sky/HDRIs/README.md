# Sky HDRIs

Imported free UE5 skybox/HDRI assets from Epic Fab:

| Asset | Fab Listing |
|-------|-------------|
| 13 Nebula Skyboxes (8K HDRIs) | https://fab.com/listings/f963e9c0-827a-4e63-9ccc-d175f2b0fec6 |
| HDRI Variety Skyboxes V4 | https://fab.com/listings/27c6f053-8240-4819-acd0-86b7c93ff064 |
| Open World Template (sky + 13 weather presets) | https://fab.com/listings/21419fd3-7f55-49b9-b8b2-df32bd34110b |

## Usage

HDRI cubemap textures go into this folder. They are consumed by:

- **`NLTAtmosphereSubsystem`** — `SkyboxCubemap` property passed to the sky dome material
  (`SkyboxCubemap` texture parameter) and to the `SkyLight` for image-based reflections.
- **Night Cinematic Environment Presets** — night-time lighting variants.

## Asset Parameter Names

The sky dome master material (`M_SkyDome_Master`) should expose:
- `SkyboxCubemap` (texture cube) — HDRI for the sky background + IBL
- `SunIntensity` (scalar) — driven by time-of-day
- `StarIntensity` (scalar) — driven by time-of-day
- `HorizonGlow` (scalar) — driven by time-of-day
- `CloudCoverage` (scalar) — driven by time-of-day
- `SkyColor` (vector) — fallback when no cubemap assigned

## Naming Convention

```
T_Sky_HNebula_01      (TextureCube)
T_Sky_HNebula_02      (TextureCube)
...
T_Sky_NightCity_01    (TextureCube)
T_Sky_Clear_01        (TextureCube)
MI_Sky_Nebula_01      (MaterialInstance)
```
