// helpers.jsx — shared atoms for the NLT Fusion habitat UI.
// Exported to window so the view scripts (live-sim, fleet, fusion) can use them.

const { useState, useEffect, useRef, useMemo } = React;

/* ---------------- util ---------------- */

const pct = (v) => Math.round((v || 0) * 100);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Wellbeing score 0..1 — drives mood crystal color (green good → red bad).
function wellbeing(a) {
  return clamp01(0.55 * a.focus + 0.2 * (1 - a.stress) + 0.15 * (1 - a.cogLoad) + 0.1 * (1 - a.burnout));
}

// hue → soft pastel + saturated pair for an avatar's identity color.
function hueColors(hue) {
  return {
    base: `hsl(${hue} 68% 56%)`,
    deep: `hsl(${hue} 62% 42%)`,
    soft: `hsl(${hue} 70% 92%)`,
    ring: `hsl(${hue} 75% 64%)`,
  };
}

// Friendly label for an avatar runtime state.
const STATE_LABEL = {
  idle: "Idle", walking: "Walking", working: "On task", drifting: "Drifting",
  hyperfocus: "Hyperfocus", overwhelmed: "Overwhelmed", coached: "Coached",
};
const STATE_COLOR = {
  idle: "var(--ink-3)", walking: "var(--gold-deep)", working: "var(--focus)", drifting: "var(--load)",
  hyperfocus: "var(--violet)", overwhelmed: "var(--burnout)", coached: "var(--calm)",
};

// Event-kind → display metadata.
const EVENT_META = {
  MOVE_TO_OBJECT: { c: "var(--gold-deep)", g: "world", label: "GO TO" },
  INTERACTION_STARTED: { c: "var(--focus)", g: "world", label: "USE" },
  USE_OBJECT: { c: "var(--focus)", g: "world", label: "INTERACT" },
  NEED_LOW: { c: "var(--stress)", g: "state", label: "NEED↓" },
  NEED_RECOVER: { c: "var(--calm)", g: "state", label: "REST" },
  TASK_START: { c: "var(--focus)", g: "task", label: "TASK START" },
  TASK_COMPLETE: { c: "var(--calm)", g: "task", label: "TASK ✓" },
  TASK_FAIL: { c: "var(--burnout)", g: "task", label: "TASK ✗" },
  FOCUS_DRIFT: { c: "var(--load)", g: "focus", label: "DRIFT" },
  FOCUS_RECOVER: { c: "var(--focus)", g: "focus", label: "RECOVER" },
  HYPERFOCUS_ENTER: { c: "var(--violet)", g: "focus", label: "HYPERFOCUS" },
  HYPERFOCUS_EXIT: { c: "var(--violet)", g: "focus", label: "EXIT FOCUS" },
  NPC_INTERRUPT: { c: "var(--stress)", g: "world", label: "INTERRUPT" },
  NPC_REACTION: { c: "var(--ink-2)", g: "world", label: "NPC" },
  COACHING_INTERVENTION: { c: "var(--calm)", g: "aide", label: "COACH" },
  STRATEGY_APPLIED: { c: "var(--calm)", g: "aide", label: "STRATEGY" },
  STRESS_SPIKE: { c: "var(--stress)", g: "state", label: "STRESS↑" },
  COGNITIVE_LOAD_HIGH: { c: "var(--load)", g: "state", label: "LOAD↑" },
  BURNOUT_RISK: { c: "var(--burnout)", g: "state", label: "BURNOUT" },
  CHECKPOINT_PASSED: { c: "var(--focus)", g: "task", label: "CHECKPOINT" },
  INDEPENDENCE_GAIN: { c: "var(--independ)", g: "growth", label: "INDEP↑" },
  TICK: { c: "var(--ink-3)", g: "sys", label: "TICK" },
  ENTITY_MOVED: { c: "var(--ink-3)", g: "sys", label: "MOVE" },
};
const eventMeta = (k) => EVENT_META[k] || { c: "var(--ink-3)", g: "sys", label: k };

/* ------ AI inner-monologue generator ------
   Derives a first-person "thought" from the avatar's runtime state, so devs
   can read the model's internal narrative. Deterministic-ish per state. */
function aiThought(a, lastEvent) {
  const bank = {
    idle: ["okay… what's next on the list?", "I could start. in a sec.", "where did I put my momentum?"],
    working: ["one line at a time. keep going.", "this is fine. I've got this.", "stay with it… stay with it."],
    drifting: ["wait — what was I—", "ooh, the window. …no. focus.", "I'll just check one thing real quick."],
    hyperfocus: ["just one more pass. one more.", "everything else can wait. THIS.", "I lost track of time and I don't care."],
    overwhelmed: ["too much. too much at once.", "everything is loud right now.", "I don't know where to even start."],
    coached: ["okay. okay. that helps, actually.", "right — small step first. breathe.", "I can do the next bit."],
  };
  const opts = bank[a.state] || bank.idle;
  // stress overlay
  if (a.stress > 0.72 && a.state !== "coached") return "my chest is tight. this is a lot.";
  if (a.burnout > 0.5) return "I'm running on empty here.";
  // pick by a stable-ish index from elapsed
  return opts[Math.floor((a.elapsed + a.interventions) % opts.length)];
}

/* ---------------- MoodCrystal (plumbob homage) ---------------- */
function MoodCrystal({ score, shape = "plumbob", size = 30 }) {
  // color: red(0) → amber(.5) → green(1)
  const hue = 6 + score * 124;
  const color = `hsl(${hue} 78% 55%)`;
  const glow = `hsl(${hue} 85% 62%)`;
  const dur = `${(4.5 / Math.max(0.15, (window.__anim ?? 1))).toFixed(2)}s`;

  if (shape === "orb") {
    return (
      <div style={{ position: "relative", width: size, height: size }} aria-hidden="true">
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, #fff 0%, ${glow} 32%, ${color} 75%)`,
          boxShadow: `0 0 14px ${glow}, 0 0 4px #fff inset`,
          animation: `bob ${dur} ease-in-out infinite`,
        }} />
      </div>
    );
  }
  if (shape === "star") {
    return (
      <div style={{ position: "relative", width: size, height: size, animation: `bob ${dur} ease-in-out infinite` }} aria-hidden="true">
        <svg viewBox="0 0 24 24" width={size} height={size} style={{ filter: `drop-shadow(0 0 7px ${glow})` }}>
          <path d="M12 1l3 7 7.5.5-5.8 4.8 2 7.3L12 18l-6.7 2.6 2-7.3L1.5 8.5 9 8z"
            fill={color} stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  // default: plumbob diamond (two stacked tetrahedra look via CSS)
  const s = size;
  return (
    <div style={{ position: "relative", width: s, height: s * 1.5, animation: `bob ${dur} ease-in-out infinite` }} aria-hidden="true">
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: `${s / 2}px solid transparent`,
        borderRight: `${s / 2}px solid transparent`,
        borderBottom: `${s * 0.62}px solid ${color}`,
        filter: `drop-shadow(0 0 8px ${glow})`,
      }} />
      <div style={{
        position: "absolute", top: `${s * 0.62}px`, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: `${s / 2}px solid transparent`,
        borderRight: `${s / 2}px solid transparent`,
        borderTop: `${s * 0.88}px solid ${color}`,
        opacity: 0.82,
      }} />
      {/* shine */}
      <div style={{
        position: "absolute", top: `${s * 0.14}px`, left: `${s * 0.3}px`,
        width: `${s * 0.18}px`, height: `${s * 0.28}px`, borderRadius: "50%",
        background: "rgba(255,255,255,.75)", transform: "rotate(20deg)",
      }} />
    </div>
  );
}

/* ---------------- Character sprite (rounded "bean") ---------------- */
// kind: 'avatar' | 'aide' | 'npc'
function Sprite({ hue = 200, label, kind = "avatar", state = "idle", size = 64, facing = "south", talking = false }) {
  const c = hueColors(hue);
  const dur = `${(3 + (hue % 5) * 0.3) / Math.max(0.15, (window.__anim ?? 1))}s`;
  const eyeShift = facing === "east" ? 3 : facing === "west" ? -3 : 0;
  const bodyH = size;
  const headR = size * 0.4;

  // aide gets a soft "halo"; npc is flatter/cooler
  const ring = kind === "aide" ? "var(--calm)" : c.ring;
  const animate = state === "working" || state === "hyperfocus" || kind === "aide";

  return (
    <div style={{ position: "relative", width: size, height: size * 1.35, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* shadow */}
      <div style={{
        position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
        width: size * 0.7, height: size * 0.18, borderRadius: "50%",
        background: "rgba(60,45,20,.22)", filter: "blur(2px)",
      }} />
      <div style={{
        position: "relative", width: size, height: size * 1.3,
        animation: animate ? `bob ${dur} ease-in-out infinite` : "none",
      }}>
        {/* body */}
        <div style={{
          position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: size * 0.74, height: bodyH * 0.72,
          background: `linear-gradient(155deg, ${c.base}, ${c.deep})`,
          borderRadius: `${size * 0.4}px ${size * 0.4}px ${size * 0.3}px ${size * 0.3}px`,
          boxShadow: `inset 0 ${size * 0.1}px ${size * 0.16}px rgba(255,255,255,.35), 0 3px 8px rgba(60,45,20,.25)`,
          border: kind === "npc" ? "2px dashed rgba(255,255,255,.5)" : "none",
        }} />
        {/* head */}
        <div style={{
          position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
          width: headR * 2, height: headR * 2, borderRadius: "50%",
          background: `radial-gradient(circle at 38% 32%, #fff6, ${c.base} 55%, ${c.deep})`,
          boxShadow: `0 0 0 3px ${c.soft}, 0 3px 7px rgba(60,45,20,.3)`,
        }}>
          {/* eyes */}
          <div style={{ position: "absolute", top: "42%", left: "50%", transform: `translate(calc(-50% + ${eyeShift}px), -50%)`, display: "flex", gap: headR * 0.38 }}>
            {[0, 1].map(i => (
              <div key={i} style={{
                width: Math.max(3, headR * 0.18), height: Math.max(4, headR * 0.26),
                borderRadius: "50%", background: "#241f1a",
                animation: `blink ${(4 + i) }s ease-in-out infinite`,
              }} />
            ))}
          </div>
        </div>
        {/* talking dots */}
        {talking && (
          <div style={{ position: "absolute", top: -6, right: -4, display: "flex", gap: 2 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 4, height: 4, borderRadius: "50%", background: ring,
                animation: `pulseGlow ${0.9}s ease-in-out ${i * 0.15}s infinite`,
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Needs bar (Sims-style) ---------------- */
function NeedBar({ label, value, color, soft, invert = false, hint, mono }) {
  const v = clamp01(value);
  // invert: high value is BAD (stress, load, burnout) → show as fill but tint red when high
  const display = pct(v);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", fontFamily: "var(--font-display)" }}>{label}</span>
        <span className={mono ? "mono tab-num" : "tab-num"} style={{ fontSize: 12, fontWeight: 700, color }}>{display}%</span>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 999, background: "var(--card-2)", boxShadow: "var(--sh-inset)", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, width: `${display}%`,
          background: `linear-gradient(90deg, ${soft}, ${color})`,
          borderRadius: 999, transition: "width .5s cubic-bezier(.2,.8,.2,1)",
          boxShadow: `0 0 8px ${color}66`,
        }} />
        {/* glossy top */}
        <div style={{ position: "absolute", top: 1, left: 2, right: 2, height: 3, borderRadius: 999, background: "rgba(255,255,255,.45)", width: `calc(${display}% - 4px)`, minWidth: 0 }} />
      </div>
      {hint && <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{hint}</span>}
    </div>
  );
}

/* ---------------- Ring gauge (for fusion readiness etc) ---------------- */
function RingGauge({ value, size = 96, stroke = 9, color = "var(--violet)", track = "var(--line)", label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = clamp01(value);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: size * 0.26, color: "var(--ink)" }} className="tab-num">{pct(v)}</span>
        {sub && <span style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: -2 }}>{sub}</span>}
      </div>
    </div>
  );
}

/* ---------------- Sparkline ---------------- */
function Sparkline({ data, color = "var(--focus)", w = 120, h = 30 }) {
  if (!data || data.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...data, 0.001), min = Math.min(...data, 0);
  const span = Math.max(0.001, max - min);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / span) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

Object.assign(window, {
  NLT_pct: pct, NLT_clamp01: clamp01, NLT_wellbeing: wellbeing, NLT_hueColors: hueColors,
  NLT_STATE_LABEL: STATE_LABEL, NLT_STATE_COLOR: STATE_COLOR, NLT_eventMeta: eventMeta,
  NLT_aiThought: aiThought,
  MoodCrystal, Sprite, NeedBar, RingGauge, Sparkline,
});
