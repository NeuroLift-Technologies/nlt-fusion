// telemetry.jsx — developer "AI internals" surfaces:
//  - EventStream: live tagged event log
//  - StateInspector: live runtime-state readout (JSON-ish)
//  - AidePolicy: shows the coaching decision logic
//  - ThoughtLog: the avatar model's inner monologue history

const { useState: useTState, useEffect: useTEffect, useRef: useTRef } = React;

/* ---- live tagged event stream ---- */
function EventStream({ events, avatarId, depth = "annotated" }) {
  const mine = events.filter(e => !avatarId || e.avatarId === avatarId);
  const shown = depth === "clean" ? mine.filter(e => e.kind !== "TICK" && e.kind !== "ENTITY_MOVED") : mine;
  return (
    <div className="scroll" style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, paddingRight: 4, flex: 1, minHeight: 0 }}>
      {shown.slice(0, 60).map((e) => {
        const m = window.NLT_eventMeta(e.kind);
        return (
          <div key={e.id} className="mono" style={{
            display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "baseline",
            fontSize: 11, padding: "3px 7px", borderRadius: 7,
            background: "var(--card-2)", animation: "slideIn .25s ease both",
          }}>
            <span style={{
              color: "#fff", background: m.c, padding: "1px 6px", borderRadius: 5,
              fontSize: 9.5, fontWeight: 700, letterSpacing: ".02em", whiteSpace: "nowrap",
            }}>{m.label}</span>
            <span style={{ color: "var(--ink-2)", lineHeight: 1.35 }}>
              {depth === "full" && <span style={{ color: "var(--ink-3)" }}>{e.avatarName} · </span>}
              {e.text}
              {depth === "full" && e.effectiveness != null && (
                <span style={{ color: "var(--calm)" }}> ·eff={e.effectiveness.toFixed(2)}</span>
              )}
            </span>
          </div>
        );
      })}
      {shown.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 12, padding: 8 }}>waiting for events…</div>}
    </div>
  );
}

/* ---- runtime state inspector (JSON-ish) ---- */
function StateInspector({ a }) {
  const rows = [
    ["state", `"${a.state}"`, window.NLT_STATE_COLOR[a.state]],
    ["focus", a.focus.toFixed(3), "var(--focus)"],
    ["stress", a.stress.toFixed(3), "var(--stress)"],
    ["cogLoad", a.cogLoad.toFixed(3), "var(--load)"],
    ["burnout", a.burnout.toFixed(3), "var(--burnout)"],
    ["independence", a.independence.toFixed(3), "var(--independ)"],
    ["fusionReady", a.fusionReady.toFixed(3), "var(--gold-deep)"],
    ["successRate", a.successRate.toFixed(3), "var(--ink)"],
    ["elapsed/expected", `${a.elapsed.toFixed(0)}/${a.expected}`, "var(--ink)"],
    ["interventions", a.interventions, "var(--calm)"],
    ["successes/failures", `${a.successes}/${a.failures}`, "var(--ink)"],
    ["room", `"${a.room}"`, "var(--ink)"],
    ["pos", `[${a.px},${a.py}]→[${a.tx},${a.ty}]`, "var(--ink-2)"],
  ];
  return (
    <div className="mono scroll" style={{ overflowY: "auto", fontSize: 11.5, lineHeight: 1.7, flex: 1, minHeight: 0 }}>
      <div style={{ color: "var(--ink-3)" }}>avatar <span style={{ color: "var(--ink)" }}>{a.id}</span> {"{"}</div>
      {rows.map(([k, v, c]) => (
        <div key={k} style={{ paddingLeft: 14, display: "flex", justifyContent: "space-between", maxWidth: 320 }}>
          <span style={{ color: "var(--ink-3)" }}>{k}:</span>
          <span style={{ color: c, fontWeight: 600 }}>{String(v)}</span>
        </div>
      ))}
      <div style={{ color: "var(--ink-3)" }}>{"}"}</div>
    </div>
  );
}

/* ---- aide coaching policy ---- */
function AidePolicy({ a, aide, threshold, lastIntervention }) {
  const urgency = Math.max(a.stress, a.cogLoad, 1 - a.focus);
  const willFire = urgency > threshold;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: "var(--calm)", display: "grid", placeItems: "center", boxShadow: "var(--sh-card)" }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/></svg>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14 }}>{aide.name}</div>
          <div style={{ fontSize: 11, color: "var(--ink-2)" }}>{aide.style}</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5 }}>
        <span style={{ color: "var(--ink-3)" }}>toolkit · </span>{aide.focus}
      </div>

      {/* live decision */}
      <div className="mono" style={{ background: "var(--card-2)", borderRadius: 10, padding: "10px 11px", fontSize: 11, lineHeight: 1.7 }}>
        <div style={{ color: "var(--ink-3)", marginBottom: 4, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 10, letterSpacing: ".06em" }}>POLICY · DECIDE</div>
        <div><span style={{ color: "var(--ink-3)" }}>urgency = max(stress, load, 1−focus) = </span><b style={{ color: willFire ? "var(--stress)" : "var(--focus)" }}>{urgency.toFixed(2)}</b></div>
        <div><span style={{ color: "var(--ink-3)" }}>threshold = </span><b>{threshold.toFixed(2)}</b></div>
        <div style={{ marginTop: 3 }}>
          {willFire
            ? <span style={{ color: "var(--calm)", fontWeight: 700 }}>→ INTERVENE (urgency &gt; θ)</span>
            : <span style={{ color: "var(--ink-3)" }}>→ observe (below θ)</span>}
        </div>
      </div>

      {lastIntervention && (
        <div style={{ borderLeft: "3px solid var(--calm)", paddingLeft: 11 }}>
          <div style={{ fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--font-display)", letterSpacing: ".05em", fontWeight: 600 }}>LAST INTERVENTION</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>“{lastIntervention.strategy}”</div>
          <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }} className="mono">
            effectiveness <b style={{ color: "var(--calm)" }}>{(lastIntervention.effectiveness * 100).toFixed(0)}%</b>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { EventStream, StateInspector, AidePolicy });
