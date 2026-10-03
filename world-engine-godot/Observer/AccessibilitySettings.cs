using System;
using System.Collections.Generic;
using Godot;

namespace NltWorldEngine.Observer;

/// <summary>
/// Accessibility, as a renderer constraint rather than a later pass (RENDERER-PLAN.md D.4).
///
/// Reduced motion is worth a note on its own. It is in direct tension with animated walk cycles and
/// the unconditional wind shader in <c>VegetationBuilder.cs</c> — GRAPH-001 flags that conflict and
/// it is *not* resolved by this work, because the character pipeline (B.2) is blocked behind
/// Joshua's G1 decisions. What this class does is give the setting a single home and make every
/// panel in the observer honour it, so the conflict has one obvious seam when B.2 lands.
///
/// Colour-safe indicators, minimal flashing and plain-language events are not switches: they are
/// properties of how <see cref="Ui"/> and <see cref="Palette"/> are built. Okabe–Ito hues, a
/// distinct shape per indicator, a text label beside every colour, and no animated flashing anywhere.
/// </summary>
public sealed class AccessibilitySettings
{
    /// <summary>Raised when any setting changes, so panels can restyle without polling.</summary>
    public event Action? Changed;

    private bool _reducedMotion;
    private bool _highContrast;
    private float _textScale = 1f;

    /// <summary>
    /// Suppress observer animation: the timeline cursor eases instead of snapping, panel content
    /// cross-fades are dropped, and no motion is used to convey a change.
    /// </summary>
    public bool ReducedMotion
    {
        get => _reducedMotion;
        set => Set(ref _reducedMotion, value);
    }

    /// <summary>Brighter foregrounds, heavier borders, no dim greys carrying meaning.</summary>
    public bool HighContrast
    {
        get => _highContrast;
        set => Set(ref _highContrast, value);
    }

    /// <summary>Type size multiplier, 0.85 to 1.6. Applied to the whole observer theme.</summary>
    public float TextScale
    {
        get => _textScale;
        set => Set(ref _textScale, Math.Clamp(value, 0.85f, 1.6f));
    }

    public Palette Palette => _highContrast ? Palette.HighContrast : Palette.Default;

    public int Font(int baseSize) => Mathf.RoundToInt(baseSize * _textScale);

    /// <summary>
    /// How quickly an indicator may change state. Reduced motion returns an instant, honest value
    /// rather than a slow animation — no movement at all is the accessible option.
    /// </summary>
    public float TransitionSeconds => _reducedMotion ? 0f : 0.18f;

    private void Set<T>(ref T field, T value, [System.Runtime.CompilerServices.CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
            return;
        field = value;
        Changed?.Invoke();
    }
}