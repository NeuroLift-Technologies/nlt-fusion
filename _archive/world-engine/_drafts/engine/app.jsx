// World Engine — main app composition.

const { useState, useEffect, useMemo, useCallback } = React;
const { World } = window.WE_VIEW;
const {
  TopBar, AvatarStateCard, EventStream, AideLog,
  FleetRoster, ScenarioControls, NpcRoster, ProgressPanel,
} = window.WE_HUD;
const WE = window.WE_DATA;

const ACCENT_PALETTES = [
  ["#f5a623", "#ffd66b"],
  ["#22d3ee", "#67e8f9"],
  ["#a3e635", "#d9f99d"],
  ["#e879f9", "#f0abfc"],
  ["#60a5fa", "#93c5fd"],
];

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "selectedAvatar": "stay_alert",
  "timeScale": 1,
  "tickHz": 4,
  "dysfunctionOn": true,
  "theme": "dark",
  "density": "comfortable",
  "accent": ["#f5a623", "#ffd66b"],
  "urgencyThreshold": 60,
  "showLabels": true
}/*EDITMODE-END*/;

function WorldEngineApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // apply theme + density + accent
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
    const pal = ACCENT_PALETTES[t.accentName] || ACCENT_PALETTES.amber;
    document.documentElement.style.setProperty('--accent', pal[0]);
    document.documentElement.style.setProperty('--accent-2', pal[1]);
  }, [t.theme, t.density, t.accentName]);

  const sim = window.useWorldEngine({
    tickHz: t.tickHz,
    timeScale: t.timeScale,
    dysfunctionOn: t.dysfunctionOn,
    urgencyThreshold: t.urgencyThreshold,
  });

  const selected = sim.avatars.find(a => a.id === t.selectedAvatar) || sim.avatars[0];

  const accent = useMemo(() => (ACCENT_PALETTES[t.accentName] || ACCENT_PALETTES.amber)[0], [t.accentName]);

  // zoom + pan
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan]   = useState({ x: 0, y: 0 });

  const handleSelect = (id) => setTweak('selectedAvatar', id);

  const handleAssign = (avatarId, scenarioId) => {
    // imperative override: directly set scenario on next state
    const sc = WE.SCENARIOS.find(s => s.id === scenarioId);
    if (!sc) return;
    // Reach into the sim — we expose setAvatars via a side channel:
    window.__WE_assign && window.__WE_assign(avatarId, sc);
  };

  // hacky bridge: expose an assign fn from the sim (we patch via useEffect)
  useEffect(() => {
    window.__WE_assign = (id, sc) => {
      // patch by re-creating via React doesn't work directly here;
      // we just inject an event into the running engine instead, by
      // dispatching an event the sim hook can listen for. For demo simplicity
      // we mutate the avatar in-place — React state still re-renders via tick.
      const av = sim.avatars.find(a => a.id === id);
      if (av) {
        av.scenarioId = sc.id;
        av.expected = sc.minutes;
        av.elapsed = 0;
        av.state = 'working';
        const room = WE.ROOMS.find(r => r.id === sc.room);
        if (room) {
          av.room = room.id;
          av.tx = room.x + Math.floor(room.w / 2);
          av.ty = room.y + Math.floor(room.h / 2);
        }
      }
    };
  }, [sim.avatars]);

  return (
    <div className="we-app">
      <TopBar
        simTime={sim.simTime}
        tickCount={sim.tickCount}
        running={sim.running}
        onToggle={sim.toggleRun}
        onReset={sim.reset}
        onStep={sim.stepOnce}
        accent={accent}
      />

      <div className="we-body">
        <div className="we-col-left">
          <FleetRoster
            avatars={sim.avatars}
            selectedId={selected?.id}
            onSelect={handleSelect}
          />
        </div>

        <div className="we-col-stage">
          <div className="we-stage">
            <div className="we-stage-info">
              <span className="legend">FOCUSED ON</span>
              <span className="focus">{selected?.name} <span style={{ color: 'var(--ink-3)' }}>· {selected?.trait}</span></span>
              <span className="scene">
                {selected?.scenarioId
                  ? `${WE.SCENARIOS.find(s => s.id === selected.scenarioId)?.name} · ${selected.elapsed.toFixed(0)}/${selected.expected}m`
                  : 'idle — no active scenario'}
              </span>
            </div>

            <World
              avatars={sim.avatars}
              selectedId={selected?.id}
              onSelectAvatar={handleSelect}
              showLabels={t.showLabels}
              scale={zoom}
              panX={pan.x}
              panY={pan.y}
            />

            <div className="we-stage-overlay" />

            <div className="we-stage-tools">
              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>−</button>
              <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="reset view">◌</button>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))}>+</button>
              <button onClick={() => setTweak('showLabels', !t.showLabels)} title="toggle labels">
                {t.showLabels ? '☰' : '☱'}
              </button>
            </div>
          </div>
        </div>

        <div className="we-col-right">
          <AvatarStateCard av={selected} />
          <AideLog interventions={sim.interventions} />
        </div>

        <div className="we-col-bottom">
          <div className="we-bottom-row">
            <ScenarioControls
              avatar={selected}
              onAssign={handleAssign}
              dysfunctionOn={t.dysfunctionOn}
            />
            <EventStream events={sim.events} accent={accent} />
            <ProgressPanel avatar={selected} />
          </div>
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Simulation">
          <TweakSelect label="Active Avatar"
            value={t.selectedAvatar}
            onChange={v => setTweak('selectedAvatar', v)}
            options={WE.AVATARS.map(a => ({ value: a.id, label: `${a.name} — ${a.trait}` }))}
          />
          <TweakSlider label="Time scale" value={t.timeScale}
            min={0.25} max={6} step={0.25}
            onChange={v => setTweak('timeScale', v)}
            format={v => `${v.toFixed(2)}× min/tick`}
          />
          <TweakSlider label="Tick rate" value={t.tickHz}
            min={1} max={12} step={1}
            onChange={v => setTweak('tickHz', v)}
            format={v => `${v} Hz`}
          />
          <TweakSlider label="Urgency threshold" value={t.urgencyThreshold}
            min={0.2} max={0.95} step={0.05}
            onChange={v => setTweak('urgencyThreshold', v)}
            format={v => `${Math.round(v * 100)}%`}
          />
          <TweakToggle label="Dysfunction injection"
            value={t.dysfunctionOn}
            onChange={v => setTweak('dysfunctionOn', v)}
          />
        </TweakSection>

        <TweakSection title="Appearance">
          <TweakRadio label="Theme"
            value={t.theme} onChange={v => setTweak('theme', v)}
            options={[
              { value: 'dark',  label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'brand', label: 'Brand' },
            ]}
          />
          <TweakRadio label="Density"
            value={t.density} onChange={v => setTweak('density', v)}
            options={[
              { value: 'comfortable', label: 'Roomy' },
              { value: 'compact',     label: 'Compact' },
            ]}
          />
          <TweakColor label="Accent"
            value={t.accentName}
            onChange={v => setTweak('accentName', v)}
            options={Object.entries(ACCENT_PALETTES).map(([k, p]) => ({ value: k, color: p[0] }))}
          />
          <TweakToggle label="Show name tags"
            value={t.showLabels}
            onChange={v => setTweak('showLabels', v)}
          />
        </TweakSection>

        <TweakSection title="World">
          <TweakButton label="Reset simulation" onClick={sim.reset} />
          <TweakButton label="Run 50 ticks" onClick={() => {
            for (let i = 0; i < 50; i++) sim.stepOnce();
          }} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<WorldEngineApp />);
