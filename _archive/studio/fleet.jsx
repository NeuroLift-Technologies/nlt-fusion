// fleet.jsx — World Engine fleet dashboard. Active roster at a glance,
// reskinned bright/game-UI. Grid of "character tiles" + a global event ticker.

function FleetView({ world, WE, selectedId, onSelect, t }) {
  // sort by fusion readiness desc for a sense of progress
  const avatars = [...world.avatars];

  const fleetStats = {
    coached: world.avatars.filter(a => a.state === "coached").length,
    working: world.avatars.filter(a => a.state === "working" || a.state === "hyperfocus").length,
    strained: world.avatars.filter(a => a.stress > 0.6 || a.cogLoad > 0.75).length,
    avgFusion: world.avatars.reduce((s, a) => s + a.fusionReady, 0) / world.avatars.length,
    interventions: world.interventions.length,
  };

  return (
    <div className="fleet-grid">
      <div className="fleet-main scroll">
        {/* summary strip */}
        <div className="fleet-summary">
          <SummaryStat label="Avatars on task" value={fleetStats.working} total={world.avatars.length} color="var(--focus)" />
          <SummaryStat label="Being coached" value={fleetStats.coached} color="var(--calm)" />
          <SummaryStat label="Under strain" value={fleetStats.strained} color="var(--stress)" />
          <SummaryStat label="Interventions" value={fleetStats.interventions} color="var(--gold-deep)" />
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 11, paddingRight: 4 }}>
            <RingGauge value={fleetStats.avgFusion} size={58} stroke={7} color="var(--violet)" sub="fusion" />
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>Avg readiness</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 150, lineHeight: 1.35 }}>Avatar → Advocate progression across the fleet</div>
            </div>
          </div>
        </div>

        {/* avatar tiles */}
        <div className="fleet-tiles">
          {avatars.map(a => {
            const hc = window.NLT_hueColors(a.hue);
            const aide = WE.AIDES[a.id];
            const sc = a.scenarioId ? WE.SCENARIOS.find(s => s.id === a.scenarioId) : null;
            const sel = a.id === selectedId;
            return (
              <button key={a.id} onClick={() => onSelect(a.id)} className="fleet-tile" data-sel={sel}
                style={{ "--tile-accent": hc.base }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <div style={{ flex: "none", position: "relative", width: 44 }}>
                    <Sprite hue={a.hue} kind="avatar" state={a.state} size={40} />
                    <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)" }}>
                      <MoodCrystal score={window.NLT_wellbeing(a)} shape={t.crystalShape} size={16} />
                    </div>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{a.name}</span>
                      <span className="chip" style={{ background: hc.soft, color: hc.deep, padding: "2px 7px", fontSize: 10 }}>{a.tag}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.trait}</div>
                  </div>
                  <span className="fleet-state" style={{ color: window.NLT_STATE_COLOR[a.state] }}>{window.NLT_STATE_LABEL[a.state]}</span>
                </div>

                {/* mini needs */}
                <div className="fleet-bars">
                  <MiniBar v={a.focus} c="var(--focus)" />
                  <MiniBar v={a.stress} c="var(--stress)" />
                  <MiniBar v={a.cogLoad} c="var(--load)" />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 9 }}>
                  <span style={{ fontSize: 10.5, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
                    {sc ? `▸ ${sc.name}` : "○ idle"}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--violet)", fontWeight: 700 }} className="tab-num">
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--violet)" }} />
                    {window.NLT_pct(a.fusionReady)}% fusion
                  </span>
                </div>
                {/* fusion progress underline */}
                <div style={{ height: 3, borderRadius: 999, background: "var(--card-2)", marginTop: 7, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${window.NLT_pct(a.fusionReady)}%`, background: "var(--fusion)", borderRadius: 999, transition: "width .5s" }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* global ticker */}
      <div className="fleet-ticker card scroll">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: world.running ? "var(--calm)" : "var(--ink-3)", boxShadow: world.running ? "0 0 0 4px color-mix(in oklab, var(--calm) 30%, transparent)" : "none" }} />
          <h3 style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink-2)" }}>World event stream</h3>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)" }} className="mono">{world.events.length} evt</span>
        </div>
        <EventStream events={world.events} depth="full" />
      </div>
    </div>
  );
}

function SummaryStat({ label, value, total, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, color, lineHeight: 1 }} className="tab-num">
        {value}{total != null && <span style={{ fontSize: 14, color: "var(--ink-3)", fontWeight: 600 }}>/{total}</span>}
      </div>
    </div>
  );
}

function MiniBar({ v, c }) {
  return (
    <div style={{ flex: 1, height: 6, borderRadius: 999, background: "var(--card-2)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${window.NLT_pct(v)}%`, background: c, borderRadius: 999, transition: "width .4s" }} />
    </div>
  );
}

Object.assign(window, { FleetView });
