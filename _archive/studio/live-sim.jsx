// live-sim.jsx — HERO view. One Avatar + Aide pair living a scenario,
// rendered Sims-style, with the AI's internals exposed for developers.

const { useState: useLS, useEffect: useLSEffect, useRef: useLSRef } = React;

function ControlBtn({ onClick, title, children, primary }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px",
      borderRadius: 10, border: "1px solid var(--line)",
      background: primary ? "var(--ink)" : "var(--card)",
      color: primary ? "#fff" : "var(--ink)",
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12.5,
      boxShadow: "var(--sh-card)",
    }}>{children}</button>
  );
}

function CardHead({ children, accent, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13 }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: accent || "var(--gold)", transform: "rotate(45deg)" }} />
      <h3 style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink-2)" }}>{children}</h3>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

function LegendDot({ color, label, dashed }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-2)", fontWeight: 600 }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: color, border: dashed ? "1.5px dashed rgba(255,255,255,.7)" : "none", boxShadow: "0 0 0 2px var(--card)" }} />
      {label}
    </span>
  );
}

function LiveSim({ world, t, WE, selectedId, onSelect }) {
  const a = world.avatars.find(x => x.id === selectedId) || world.avatars[0];
  const room = WE.ROOMS.find(r => r.id === a.room) || WE.ROOMS[0];
  const aide = WE.AIDES[a.id];
  const npcs = WE.NPCS.filter(n => n.room === a.room && !n.invisible);
  const scenario = a.scenarioId ? WE.SCENARIOS.find(s => s.id === a.scenarioId) : null;
  const hc = window.NLT_hueColors(a.hue);

  // desired scenario to keep the focused avatar busy
  const [desiredScenario, setDesiredScenario] = useLS("");
  const assignGuard = useLSRef(-5);
  useLSEffect(() => {
    if (!world.running) return;
    if (!a.scenarioId && world.tickCount - assignGuard.current > 1) {
      assignGuard.current = world.tickCount;
      const sid = desiredScenario || WE.SCENARIOS[Math.floor(Math.random() * WE.SCENARIOS.length)].id;
      const tm = setTimeout(() => world.assignScenario(a.id, sid), 300);
      return () => clearTimeout(tm);
    }
  }, [a.scenarioId, world.tickCount, world.running, desiredScenario, a.id]);

  // history sparkline buffers (reset on avatar switch)
  const hist = useLSRef({ id: a.id, focus: [], stress: [], cog: [] });
  if (hist.current.id !== a.id) hist.current = { id: a.id, focus: [], stress: [], cog: [] };
  useLSEffect(() => {
    const h = hist.current;
    h.focus.push(a.focus); h.stress.push(a.stress); h.cog.push(a.cogLoad);
    ["focus", "stress", "cog"].forEach(k => { if (h[k].length > 44) h[k].shift(); });
  }, [world.tickCount]);

  // inner monologue
  const thought = window.NLT_aiThought(a, world.events[0]);
  const [thoughtLog, setThoughtLog] = useLS([]);
  const lastThought = useLSRef("");
  useLSEffect(() => {
    if (thought !== lastThought.current) {
      lastThought.current = thought;
      setThoughtLog(prev => [{ id: world.tickCount + "-" + Math.random(), text: thought, state: a.state, tick: world.tickCount }, ...prev].slice(0, 18));
    }
  }, [thought, world.tickCount]);
  // clear log on avatar switch
  const logOwner = useLSRef(a.id);
  useLSEffect(() => { if (logOwner.current !== a.id) { logOwner.current = a.id; setThoughtLog([]); } }, [a.id]);

  const lastIntervention = world.interventions.find(i => i.avatarId === a.id);
  const speeds = [[0.5, "Slow"], [1, "Calm"], [2, "Brisk"], [4, "Fast"]];

  return (
    <div className="ls-grid">
      {/* ============ STAGE ============ */}
      <div className="ls-stage card">
        <div className="ls-controls">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ControlBtn onClick={world.toggleRun} primary title="Play / pause">
              {world.running
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>}
              {world.running ? "Pause" : "Play"}
            </ControlBtn>
            <ControlBtn onClick={world.stepOnce} title="Step one tick">Step ›</ControlBtn>
            <div style={{ display: "flex", gap: 2, background: "var(--card-2)", borderRadius: 10, padding: 3, boxShadow: "var(--sh-inset)" }}>
              {speeds.map(([s, lbl]) => (
                <button key={s} onClick={() => t.setSpeed(s)} style={{
                  height: 28, padding: "0 11px", border: "none", borderRadius: 7, cursor: "pointer",
                  background: t.speed === s ? "var(--gold)" : "transparent",
                  color: t.speed === s ? "#fff" : "var(--ink-2)",
                  fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11.5,
                }}>{lbl}</button>
              ))}
            </div>
            <ControlBtn onClick={world.reset} title="Reset world">↺ Reset</ControlBtn>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={selectedId} onChange={e => onSelect(e.target.value)} className="ls-select">
              {world.avatars.map(av => <option key={av.id} value={av.id}>{av.name} · {av.trait}</option>)}
            </select>
            <select value={desiredScenario} onChange={e => setDesiredScenario(e.target.value)} className="ls-select" title="Next scenario">
              <option value="">↻ Auto scenario</option>
              {WE.SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="ls-roombar">
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span className="chip" style={{ background: room.color, color: "#fff", flex: "none" }}>{room.name}</span>
            {scenario
              ? <span style={{ fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><b style={{ color: "var(--ink)" }}>{scenario.name}</b>{activeObj ? ` · at ${activeObj.name}` : ""} · {scenario.desc}</span>
              : targetObj
                ? <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>walking to <b style={{ color: "var(--ink)" }}>{targetObj.name}</b>…</span>
                : <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>between tasks — picking what's next…</span>}
          </div>
          {scenario && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: 168, flex: "none" }}>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }} className="mono tab-num">{a.elapsed.toFixed(0)}′/{a.expected}′</span>
              <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--card-2)", overflow: "hidden", boxShadow: "var(--sh-inset)" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (a.elapsed / a.expected) * 100)}%`, background: "var(--fusion)", borderRadius: 999, transition: "width .4s" }} />
              </div>
            </div>
          )}
        </div>

        <div className="ls-iso scroll" data-iso-wrap>
          <IsoStage
            room={room} avatar={a} aide={aide} npcs={npcs}
            showCrystal={t.showCrystal} crystalShape={t.crystalShape}
            showThought={t.showThought} thought={thought}
          />
        </div>

        <div className="ls-legend">
          <LegendDot color={hc.base} label={`${a.name} · Avatar (AI)`} />
          <LegendDot color="var(--calm)" label={`${aide.name} · Aide (AI)`} />
          {npcs.length > 0 && <LegendDot color="var(--ink-2)" label={`${npcs.length} NPC${npcs.length > 1 ? "s" : ""} (AI)`} dashed />}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }} className="mono tab-num">tick {world.tickCount} · {Math.floor(world.simTime / 60)}h{String(Math.floor(world.simTime % 60)).padStart(2, "0")}</span>
        </div>
      </div>

      {/* ============ RIGHT RAIL ============ */}
      <div className="ls-rail scroll">
        {/* identity */}
        <div className="card" style={{ padding: "var(--pad)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 56, flex: "none", display: "grid", placeItems: "center" }}>
              <Sprite hue={a.hue} kind="avatar" state={a.state} size={50} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <h2 style={{ fontSize: 19 }}>{a.name}</h2>
                <span className="chip" style={{ background: hc.soft, color: hc.deep }}>{a.tag}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 1 }}>{a.trait}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, fontStyle: "italic" }}>“{a.blurb}”</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 14 }}>
            <Stat label="State" value={window.NLT_STATE_LABEL[a.state]} color={window.NLT_STATE_COLOR[a.state]} />
            <Stat label="Success" value={window.NLT_pct(a.successRate) + "%"} />
            <Stat label="Done" value={`${a.successes}✓ ${a.failures}✗`} />
          </div>
        </div>

        {/* needs */}
        <div className="card" style={{ padding: "var(--pad)" }}>
          <CardHead accent="var(--focus)" right={<Sparkline data={hist.current.focus} color="var(--focus)" w={64} h={20} />}>Needs &amp; signals</CardHead>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <NeedBar label="Focus" value={a.focus} color="var(--focus)" soft="var(--focus-soft)" />
            <NeedBar label="Stress" value={a.stress} color="var(--stress)" soft="var(--stress-soft)" />
            <NeedBar label="Cognitive load" value={a.cogLoad} color="var(--load)" soft="var(--load-soft)" />
            <NeedBar label="Burnout risk" value={a.burnout} color="var(--burnout)" soft="var(--burnout-soft)" />
            <NeedBar label="Independence" value={a.independence} color="var(--independ)" soft="var(--independ-soft)" />
          </div>
        </div>

        {/* AI mind */}
        <div className="card" style={{ padding: "var(--pad)" }}>
          <CardHead accent="var(--violet)">Avatar mind · inner monologue</CardHead>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: "none", marginTop: 2 }}><MoodCrystal score={window.NLT_wellbeing(a)} shape={t.crystalShape} size={24} /></div>
            <div className="ai-now" key={thought}>“{thought}”</div>
          </div>
          <div className="scroll" style={{ marginTop: 12, maxHeight: 132, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {thoughtLog.slice(1).map(item => (
              <div key={item.id} style={{ display: "flex", gap: 8, fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.4 }}>
                <span className="mono" style={{ flex: "none", color: window.NLT_STATE_COLOR[item.state], fontWeight: 600, fontSize: 10 }}>{window.NLT_STATE_LABEL[item.state]}</span>
                <span style={{ fontStyle: "italic" }}>“{item.text}”</span>
              </div>
            ))}
            {thoughtLog.length <= 1 && <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>monologue history builds as the sim runs…</span>}
          </div>
        </div>

        {/* aide policy */}
        <div className="card" style={{ padding: "var(--pad)" }}>
          <CardHead accent="var(--calm)">Aide · coaching policy</CardHead>
          <AidePolicy a={a} aide={aide} threshold={t.threshold} lastIntervention={lastIntervention} />
        </div>

        {/* dev telemetry */}
        {t.showInternals && (
          <div className="card" style={{ padding: "var(--pad)", display: "flex", flexDirection: "column", minHeight: 320 }}>
            <CardHead accent="var(--gold-deep)" right={
              <div style={{ display: "flex", gap: 2, background: "var(--card-2)", borderRadius: 8, padding: 3 }}>
                {[["stream", "Events"], ["state", "State"]].map(([k, lbl]) => (
                  <button key={k} onClick={() => t.setTelemetryTab(k)} style={{
                    height: 24, padding: "0 9px", border: "none", borderRadius: 6, cursor: "pointer",
                    background: t.telemetryTab === k ? "var(--ink)" : "transparent",
                    color: t.telemetryTab === k ? "#fff" : "var(--ink-2)",
                    fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10.5,
                  }}>{lbl}</button>
                ))}
              </div>
            }>Developer telemetry</CardHead>
            {t.telemetryTab === "stream"
              ? <EventStream events={world.events} avatarId={a.id} depth={t.logDepth} />
              : <StateInspector a={a} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: "var(--card-2)", borderRadius: 11, padding: "8px 11px", minWidth: 0 }}>
      <div style={{ fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || "var(--ink)", fontFamily: "var(--font-display)", marginTop: 2, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

Object.assign(window, { LiveSim });
