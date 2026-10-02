// app.jsx — NLT Fusion "Habitat" shell.
// Owns the sim, the view router, selection, and tweak state. Threads a small
// `t` (tunables) object into each view.

const { useState: useAS, useEffect: useASEffect } = React;

function NavTab({ id, active, onClick, icon, label, sub }) {
  return (
    <button onClick={() => onClick(id)} className="nav-tab" data-active={active}>
      <span className="nav-tab-ico">{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>{sub}</span>
      </span>
    </button>
  );
}

function App() {
  const WE = window.WE_DATA;

  // ---- tweak state ----
  const [tw, setTweak] = useTweaks({
    theme: "daylight",
    accent: "#f5a623",
    crystalShape: "plumbob",
    density: "comfy",
    anim: 1,
    pace: 1,                 // sim minutes per tick — LOW = readable
    threshold: 0.6,
    dysfunction: true,
    showCrystal: true,
    showThought: true,
    showInternals: true,
    logDepth: "annotated",
  });

  // reflect global tweaks to CSS/root
  useASEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", tw.theme);
    root.style.setProperty("--gold", tw.accent);
    const dens = { cozy: ["22px", "24px"], comfy: ["18px", "20px"], compact: ["12px", "14px"] }[tw.density] || ["18px", "20px"];
    root.style.setProperty("--gap", dens[0]);
    root.style.setProperty("--pad", dens[1]);
    window.__anim = tw.anim;
  }, [tw.theme, tw.accent, tw.density, tw.anim]);

  // ---- sim ----
  // Both tick cadence AND sim-minutes-per-tick scale with `pace`, so the lowest
  // setting is genuinely slow & readable (one event burst every ~1.5s).
  const world = window.useWorldEngine({
    tickHz: 0.9 * tw.pace,
    timeScale: tw.pace,
    dysfunctionOn: tw.dysfunction,
    urgencyThreshold: tw.threshold,
  });

  const [view, setView] = useAS("live");
  const [selectedId, setSelectedId] = useAS("stay_alert");
  const [telemetryTab, setTelemetryTab] = useAS("stream");

  // tunables object passed to views
  const t = {
    speed: tw.pace, setSpeed: (v) => setTweak("pace", v),
    crystalShape: tw.crystalShape,
    showCrystal: tw.showCrystal,
    showThought: tw.showThought,
    showInternals: tw.showInternals,
    logDepth: tw.logDepth,
    threshold: tw.threshold,
    telemetryTab, setTelemetryTab,
  };

  const ICONS = {
    live: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7l10-5 10 5-10 5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
    fleet: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
    fusion: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/><circle cx="12" cy="12" r="4"/></svg>,
  };

  return (
    <div className="app">
      {/* top bar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><span /></div>
          <div>
            <div className="brand-name">NLT Fusion <span className="brand-sub">World Engine</span></div>
            <div className="brand-tag">AI avatars · living the scenario</div>
          </div>
        </div>

        <nav className="nav">
          <NavTab id="live" active={view === "live"} onClick={setView} icon={ICONS.live} label="Live Sim" sub="one pair, up close" />
          <NavTab id="fleet" active={view === "fleet"} onClick={setView} icon={ICONS.fleet} label="Fleet" sub={WE.ROSTER_MODE === "single" ? "active pair" : "all avatars"} />
          <NavTab id="fusion" active={view === "fusion"} onClick={setView} icon={ICONS.fusion} label="Fusion" sub="avatar → advocate" />
        </nav>

        <div className="topbar-right">
          <span className={"run-dot" + (world.running ? " on" : "")} />
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
            {world.running ? "running" : "paused"} · {({ 0.5: "slow", 1: "calm", 2: "brisk", 4: "fast" })[tw.pace] || tw.pace + "×"}
          </span>
        </div>
      </header>

      {/* view */}
      <main className="stage-wrap">
        {view === "live" && <LiveSim world={world} t={t} WE={WE} selectedId={selectedId} onSelect={setSelectedId} />}
        {view === "fleet" && <FleetView world={world} WE={WE} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); }} t={t} />}
        {view === "fusion" && <FusionView world={world} WE={WE} selectedId={selectedId} onSelect={setSelectedId} t={t} />}
      </main>

      {/* tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Stage">
          <TweakRadio label="Theme" value={tw.theme} options={[{ value: "daylight", label: "Day" }, { value: "dusk", label: "Dusk" }]} onChange={(v) => setTweak("theme", v)} />
          <TweakColor label="Accent" value={tw.accent} options={["#f5a623", "#16b8a6", "#7a5af0", "#f0654c"]} onChange={(v) => setTweak("accent", v)} />
          <TweakRadio label="Mood crystal" value={tw.crystalShape} options={[{ value: "plumbob", label: "◆" }, { value: "orb", label: "●" }, { value: "star", label: "★" }]} onChange={(v) => setTweak("crystalShape", v)} />
          <TweakRadio label="Density" value={tw.density} options={[{ value: "cozy", label: "Cozy" }, { value: "comfy", label: "Comfy" }, { value: "compact", label: "Compact" }]} onChange={(v) => setTweak("density", v)} />
        </TweakSection>

        <TweakSection title="Pace & motion">
          <TweakRadio label="Sim pace" value={tw.pace} options={[{ value: 0.5, label: "Slow" }, { value: 1, label: "Calm" }, { value: 2, label: "Brisk" }, { value: 4, label: "Fast" }]} onChange={(v) => setTweak("pace", v)} />
          <TweakSlider label="Animation" value={tw.anim} min={0} max={1.5} step={0.1} onChange={(v) => setTweak("anim", v)} />
        </TweakSection>

        <TweakSection title="AI internals">
          <TweakToggle label="Inner monologue" value={tw.showThought} onChange={(v) => setTweak("showThought", v)} />
          <TweakToggle label="Mood crystals" value={tw.showCrystal} onChange={(v) => setTweak("showCrystal", v)} />
          <TweakToggle label="Dev telemetry" value={tw.showInternals} onChange={(v) => setTweak("showInternals", v)} />
          <TweakSelect label="Log depth" value={tw.logDepth} options={[{ value: "clean", label: "Clean" }, { value: "annotated", label: "Annotated" }, { value: "full", label: "Full + effects" }]} onChange={(v) => setTweak("logDepth", v)} />
        </TweakSection>

        <TweakSection title="Simulation model">
          <TweakToggle label="ADHD traits active" value={tw.dysfunction} onChange={(v) => setTweak("dysfunction", v)} />
          <TweakSlider label="Coaching threshold" value={tw.threshold} min={0.35} max={0.85} step={0.05} onChange={(v) => setTweak("threshold", v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
