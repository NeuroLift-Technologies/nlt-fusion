// fusion.jsx — Avatar → Advocate fusion ceremony.
// The narrative payoff: when an avatar's training matures, it fuses with its
// Aide's wisdom to become a self-advocating Advocate. Cinematic, ceremonial.

const { useState: useFS, useEffect: useFSEffect, useRef: useFSRef } = React;

function FusionView({ world, WE, selectedId, onSelect, t }) {
  const a = world.avatars.find(x => x.id === selectedId) || world.avatars[0];
  const aide = WE.AIDES[a.id];
  const hc = window.NLT_hueColors(a.hue);

  const [phase, setPhase] = useFS("ready"); // ready | charging | fused
  const [boosted, setBoosted] = useFS(0);
  const timer = useFSRef(null);
  const ready = Math.min(1, a.fusionReady + boosted);

  const runCeremony = () => {
    if (phase !== "ready") { setPhase("ready"); setBoosted(0); clearInterval(timer.current); return; }
    setPhase("charging");
    let b = 0;
    const target = 1 - a.fusionReady;
    timer.current = setInterval(() => {
      b += Math.max(0.01, target / 28);
      setBoosted(Math.min(target, b));
      if (b >= target) {
        clearInterval(timer.current);
        setTimeout(() => setPhase("fused"), 480);
      }
    }, 55);
  };
  useFSEffect(() => () => clearInterval(timer.current), []);
  useFSEffect(() => { setPhase("ready"); setBoosted(0); clearInterval(timer.current); }, [a.id]);

  const milestones = [
    { k: "independence", label: "Independence", v: a.independence, need: 0.5, color: "var(--independ)" },
    { k: "success", label: "Success rate", v: a.successRate, need: 0.6, color: "var(--focus)" },
    { k: "resilience", label: "Stress resilience", v: 1 - a.stress, need: 0.5, color: "var(--calm)" },
    { k: "coached", label: "Coached sessions", v: Math.min(1, a.interventions / 12), need: 0.4, color: "var(--gold-deep)", raw: a.interventions + "×" },
  ];
  const metCount = milestones.filter(m => m.v >= m.need).length;

  return (
    <div className="fusion-grid">
      {/* ---- stage ---- */}
      <div className="fusion-stage card" data-phase={phase}>
        <div className="fusion-aura" style={{ "--hue": a.hue }} />
        <div className="fusion-rings" data-on={phase !== "ready"}><span /><span /><span /></div>

        <div className="fusion-roster">
          <select value={selectedId} onChange={e => onSelect(e.target.value)} className="ls-select">
            {world.avatars.map(av => <option key={av.id} value={av.id}>{av.name} · {window.NLT_pct(av.fusionReady)}% ready</option>)}
          </select>
        </div>

        {/* the two beings */}
        <div className="fusion-figures" data-phase={phase}>
          <div className="fusion-figure fig-avatar">
            <Sprite hue={a.hue} kind="avatar" state={phase === "fused" ? "hyperfocus" : a.state} size={88} />
            <div className="fusion-tag" style={{ background: hc.base }}>{a.name}<span>Avatar</span></div>
          </div>

          <div className="fusion-core" data-phase={phase}>
            <MoodCrystal score={phase === "fused" ? 1 : window.NLT_wellbeing(a)} shape={t.crystalShape} size={phase === "fused" ? 46 : 34} />
          </div>

          <div className="fusion-figure fig-aide">
            <Sprite hue={142} kind="aide" state="working" size={72} />
            <div className="fusion-tag" style={{ background: "var(--calm)" }}>{aide.name}<span>Aide</span></div>
          </div>
        </div>

        {/* readiness meter */}
        <div className="fusion-meter">
          <div className="fusion-meter-track">
            <div className="fusion-meter-fill" style={{ width: `${window.NLT_pct(ready)}%` }} />
          </div>
          <div className="fusion-meter-label">
            <span className="mono tab-num" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{window.NLT_pct(ready)}%</span>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>fusion readiness</span>
          </div>
        </div>

        {/* outcome / CTA */}
        {phase === "fused" ? (
          <div className="fusion-result">
            <div className="fusion-result-badge">★ ADVOCATE UNLOCKED</div>
            <h2 style={{ fontSize: 26, marginTop: 8 }}>{a.name} the Advocate</h2>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", maxWidth: 440, margin: "8px auto 0", lineHeight: 1.55, textWrap: "pretty" }}>
              {a.name} has internalised {aide.name}'s strategies. The avatar no longer needs the aide on its shoulder — it carries the toolkit within, and can now <b>advocate for itself</b> in new environments.
            </p>
            <button className="fusion-btn" onClick={runCeremony} style={{ marginTop: 18 }}>↺ Replay ceremony</button>
          </div>
        ) : (
          <div className="fusion-result">
            <p style={{ fontSize: 13, color: "var(--ink-2)", maxWidth: 430, margin: "0 auto", lineHeight: 1.55, textWrap: "pretty" }}>
              {metCount >= 3
                ? `${a.name} has met ${metCount}/4 fusion milestones. Begin the ceremony to fuse avatar + aide into a self-advocating Advocate.`
                : `${a.name} has met ${metCount}/4 milestones. You can still run a guided ceremony to preview the Advocate transformation.`}
            </p>
            <button className="fusion-btn" onClick={runCeremony} disabled={phase === "charging"} style={{ marginTop: 16 }}>
              {phase === "charging" ? "⟳ Fusing…" : "✦ Begin fusion ceremony"}
            </button>
          </div>
        )}
      </div>

      {/* ---- milestones rail ---- */}
      <div className="fusion-rail scroll">
        <div className="card" style={{ padding: "var(--pad)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--violet)", transform: "rotate(45deg)" }} />
            <h3 style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink-2)" }}>Fusion milestones</h3>
            <span className="chip" style={{ marginLeft: "auto", background: metCount >= 3 ? "color-mix(in oklab, var(--calm) 18%, transparent)" : "var(--card-2)", color: metCount >= 3 ? "var(--calm)" : "var(--ink-2)" }}>{metCount}/4 met</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
            {milestones.map(m => {
              const met = m.v >= m.need;
              return (
                <div key={m.k}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <span style={{ width: 16, height: 16, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: met ? m.color : "var(--card-2)", color: "#fff", fontSize: 10, boxShadow: met ? `0 0 0 3px color-mix(in oklab, ${m.color} 22%, transparent)` : "none" }}>{met ? "✓" : ""}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>{m.label}</span>
                    <span className="mono tab-num" style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: met ? m.color : "var(--ink-3)" }}>{m.raw || window.NLT_pct(m.v) + "%"}</span>
                  </div>
                  <div style={{ position: "relative", height: 9, borderRadius: 999, background: "var(--card-2)", overflow: "hidden", boxShadow: "var(--sh-inset)" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${window.NLT_pct(m.v)}%`, background: m.color, borderRadius: 999, transition: "width .5s" }} />
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: `${window.NLT_pct(m.need)}%`, width: 2, background: "var(--ink)", opacity: 0.4 }} title="threshold" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* what fuses */}
        <div className="card" style={{ padding: "var(--pad)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 13 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--gold-deep)", transform: "rotate(45deg)" }} />
            <h3 style={{ fontSize: 11, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--ink-2)" }}>What fuses</h3>
          </div>
          <div className="fuse-row">
            <div className="fuse-col" style={{ borderColor: hc.base }}>
              <div className="fuse-col-h" style={{ color: hc.deep }}>FROM AVATAR</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{a.trait} · lived experience of {a.tag.toLowerCase()}</div>
            </div>
            <div className="fuse-plus">+</div>
            <div className="fuse-col" style={{ borderColor: "var(--calm)" }}>
              <div className="fuse-col-h" style={{ color: "var(--calm)" }}>FROM AIDE</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{aide.focus}</div>
            </div>
          </div>
          <div className="fuse-arrow">↓</div>
          <div className="fuse-out" style={{ background: "var(--fusion)" }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".1em", color: "rgba(255,255,255,.85)" }}>ADVOCATE</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginTop: 2 }}>Self-directed, carries the toolkit within</div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { FusionView });
