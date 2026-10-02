// main.jsx — World Engine top-level app. Mounts a design canvas with four
// variations, all reading the same live simulation, plus a global Tweaks panel.

const { useState, useEffect, useMemo } = React;
const WE = window.WE_DATA;
const { Mission, Habitat, Bridge, Pixel } = window.Variations;

const ACCENT_PALETTES = [
  ['#f5a623', '#ffd66b'],   // amber
  ['#22d3ee', '#67e8f9'],   // cyan
  ['#a3e635', '#d9f99d'],   // lime
  ['#e879f9', '#f0abfc'],   // orchid
  ['#60a5fa', '#93c5fd'],   // azure
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "selectedAvatar": "task_kickstart",
  "timeScale": 1,
  "tickHz": 4,
  "dysfunctionOn": true,
  "urgencyThreshold": 0.6,
  "density": "comfortable",
  "accentIdx": 0,
  "showLabels": true,
  "paused": false
}/*EDITMODE-END*/;

function WorldEngineApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // apply density + accent globally on document
  useEffect(() => {
    document.documentElement.dataset.density = t.density;
    const pal = ACCENT_PALETTES[t.accentIdx] || ACCENT_PALETTES[0];
    document.documentElement.style.setProperty('--we-accent', pal[0]);
    document.documentElement.style.setProperty('--we-accent-2', pal[1]);
  }, [t.density, t.accentIdx]);

  const sim = window.useWorldEngine({
    tickHz: t.tickHz,
    timeScale: t.timeScale,
    dysfunctionOn: t.dysfunctionOn,
    urgencyThreshold: t.urgencyThreshold,
  });

  // honour the global paused tweak
  useEffect(() => {
    if (t.paused === sim.running) {
      sim.toggleRun();
    }
    // eslint-disable-next-line
  }, [t.paused]);

  const selected = useMemo(
    () => sim.avatars.find(a => a.id === t.selectedAvatar) || sim.avatars[0],
    [sim.avatars, t.selectedAvatar]
  );

  const onSelect = (id) => setTweak('selectedAvatar', id);
  const onAssign = (avatarId, scenarioId) => sim.assignScenario(avatarId, scenarioId);
  const onCoach  = (avatarId, strategy)  => sim.coachAvatar(avatarId, strategy);

  const sharedProps = { sim, selected, onSelect, onAssign, onCoach };

  return (
    <>
      <DesignCanvas>
        <DCSection id="variants" title="World Engine — POV split"
                   subtitle="A = Avatar POV (top-close 3rd person, what training feels like from inside). C = Aide POV (observing the coach do their job, deploy strategies). B and D held as alternate framings.">
          <DCArtboard id="mission" label="A · Avatar POV — top-close 3rd person, felt-state HUD" width={1340} height={840}>
            <Mission {...sharedProps} />
          </DCArtboard>
          <DCArtboard id="habitat" label="B · Habitat — alternate framing (kept for later use)" width={1340} height={840}>
            <Habitat {...sharedProps} />
          </DCArtboard>
          <DCArtboard id="bridge" label="C · Aide POV — observing the coach at work" width={1340} height={840}>
            <Bridge {...sharedProps} />
          </DCArtboard>
          <DCArtboard id="pixel" label="D · NeuroQuest — alternate framing (kept for later use)" width={1340} height={840}>
            <Pixel {...sharedProps} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="World Engine">
        <TweakSection label="Simulation">
          <TweakSelect label="Focused avatar"
            value={t.selectedAvatar}
            onChange={v => setTweak('selectedAvatar', v)}
            options={WE.AVATARS.map(a => ({ value: a.id, label: `${a.name} — ${a.trait}` }))}
          />
          <TweakSlider label="Time scale" value={t.timeScale}
            min={0.25} max={6} step={0.25} unit="× min/tick"
            onChange={v => setTweak('timeScale', v)}
          />
          <TweakSlider label="Tick rate" value={t.tickHz}
            min={1} max={12} step={1} unit=" Hz"
            onChange={v => setTweak('tickHz', v)}
          />
          <TweakSlider label="Aide urgency threshold" value={t.urgencyThreshold}
            min={0.2} max={0.95} step={0.05}
            onChange={v => setTweak('urgencyThreshold', v)}
          />
          <TweakToggle label="Dysfunction injection"
            value={t.dysfunctionOn}
            onChange={v => setTweak('dysfunctionOn', v)}
          />
          <TweakToggle label="Paused"
            value={t.paused}
            onChange={v => setTweak('paused', v)}
          />
        </TweakSection>

        <TweakSection label="Appearance">
          <TweakRadio label="Density"
            value={t.density} onChange={v => setTweak('density', v)}
            options={[
              { value: 'comfortable', label: 'Roomy' },
              { value: 'compact',     label: 'Compact' },
            ]}
          />
          <TweakColor label="Accent palette"
            value={ACCENT_PALETTES[t.accentIdx] || ACCENT_PALETTES[0]}
            onChange={(pal) => {
              const idx = ACCENT_PALETTES.findIndex(p => p[0] === pal[0]);
              setTweak('accentIdx', idx >= 0 ? idx : 0);
            }}
            options={ACCENT_PALETTES}
          />
          <TweakToggle label="Show avatar tags"
            value={t.showLabels}
            onChange={v => setTweak('showLabels', v)}
          />
        </TweakSection>

        <TweakSection label="World">
          <TweakButton label="Reset simulation" onClick={sim.reset} />
          <TweakButton label="Run 50 ticks" onClick={() => {
            for (let i = 0; i < 50; i++) sim.stepOnce();
          }} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<WorldEngineApp />);
