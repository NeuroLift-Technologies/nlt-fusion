# Vegetation & Foliage Assets

Imported free UE5 vegetation assets from Epic Fab:

| Asset | Fab Listing |
|-------|-------------|
| Cozy Nature – Foliage Pack | https://fab.com/listings/d6f25a58-a0ed-4491-be48-e764cb26cef6 |
| Kentucky Bluegrass v1.4 (112 Nanite meshes) | https://fab.com/listings/ae2e18fa-906b-490f-9e0e-0e2fde867ec9 |
| Stylized Grass | https://fab.com/category/material/nature-terrain--vegetation--grass?lang=en |
| Graminea 01 / 06 | https://fab.com/category/material/nature-terrain--vegetation--grass?lang=en |

## Usage

Outdoor open-world vegetation scatter:
- Trees, bushes, grass for park/district areas
- Potted plants and window-box greenery for building perimeters
- Nanite-compatible for performance

## Integration Points

- `PCG/EnvironmentScatter` — drives vegetation placement
- `NLTWorldGeneratorSubsystem` — district type → vegetation type mapping
