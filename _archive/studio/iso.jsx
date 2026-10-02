// iso.jsx — isometric room renderer for the habitat stage.
// Pure CSS/SVG. Projects a room's tile grid to 2:1 iso, draws floor + walls,
// then places props and character sprites (avatar / aide / NPCs) on top.

const { useMemo: useIsoMemo, useRef: useIsoRef, useState: useIsoState, useEffect: useIsoEffect, useLayoutEffect: useIsoLayout } = React;

const TILE = 44;     // half-width of an iso diamond
const WALL = 46;     // wall height in px

// --- prop visual library: height (in px) + face/top colors ---
const PROP_LIB = {
  desk:       { h: 22, top: "#caa46e", side: "#a07c44", w: 1, d: 1 },
  longtable:  { h: 22, top: "#b98f5e", side: "#8d6838", w: 1, d: 1 },
  table:      { h: 20, top: "#c79a63", side: "#9a7340", w: 1, d: 1 },
  counter:    { h: 30, top: "#dcdce4", side: "#b4b4c2", w: 1, d: 1 },
  monitor:    { h: 30, top: "#2b3a4a", side: "#1b2733", w: 1, d: 1, glow: "#4fd6c4" },
  screen:     { h: 40, top: "#2b3a4a", side: "#1b2733", w: 1, d: 1, glow: "#7a5af0" },
  tv:         { h: 26, top: "#23303d", side: "#161f29", w: 1, d: 1, glow: "#f5a623" },
  whiteboard: { h: 38, top: "#f4f1ea", side: "#cfc7b6", w: 1, d: 1 },
  chair:      { h: 16, top: "#7d6fb0", side: "#5b4f8a", w: 1, d: 1 },
  sofa:       { h: 18, top: "#e08b6a", side: "#b56546", w: 1, d: 1 },
  fridge:     { h: 40, top: "#e6e9ee", side: "#bcc2cc", w: 1, d: 1 },
  plant:      { h: 28, top: "#5fae5a", side: "#3f8a45", w: 1, d: 1, leaf: true },
  phone:      { h: 18, top: "#e0b04a", side: "#b1842f", w: 1, d: 1 },
};

function IsoStage({ room, avatar, aide, npcs, showCrystal = true, crystalShape = "plumbob",
                    showThought = true, thought = "", focusEntity = null, density = 1 }) {
  const OX = room.h * TILE;
  const OY = WALL + 6;
  const planeW = (room.w + room.h) * TILE;
  const planeH = (room.w + room.h) * (TILE / 2) + WALL + TILE * 1.5;

  // auto-fit the fixed-size plane into its container
  const fitRef = useIsoRef(null);
  const [scale, setScale] = useIsoState(0.9);
  useIsoEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const s = Math.min(1.2, (r.width - 28) / planeW, (r.height - 28) / planeH);
      setScale(Math.max(0.3, s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [planeW, planeH]);

  const project = (gx, gy) => ({
    x: OX + (gx - gy) * TILE,
    y: OY + (gx + gy) * (TILE / 2),
  });

  // floor tiles
  const tiles = useIsoMemo(() => {
    const out = [];
    for (let j = 0; j < room.h; j++) {
      for (let i = 0; i < room.w; i++) {
        const a = project(i, j), b = project(i + 1, j), c = project(i + 1, j + 1), d = project(i, j + 1);
        const checker = (i + j) % 2 === 0;
        out.push({ i, j, pts: `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`, checker });
      }
    }
    return out;
  }, [room.id]);

  // local avatar coords clamped into room
  const ax = Math.max(0, Math.min(room.w - 1, (avatar.px - room.x)));
  const ay = Math.max(0, Math.min(room.h - 1, (avatar.py - room.y)));

  // aide placed adjacent to avatar (toward room interior)
  const aideX = Math.max(0, Math.min(room.w - 1, ax + (ax < room.w - 1 ? 1 : -1)));
  const aideY = Math.max(0, Math.min(room.h - 1, ay));

  // assemble depth-sorted entities (props + characters)
  const items = [];
  (room.props || []).forEach((p, idx) => items.push({ type: "prop", p, lx: p.x, ly: p.y, key: "p" + idx }));
  (npcs || []).forEach((n) => items.push({ type: "npc", n, lx: n.x, ly: n.y, key: "n" + n.id }));
  if (aide) items.push({ type: "aide", lx: aideX, ly: aideY, key: "aide" });
  items.push({ type: "avatar", lx: ax, ly: ay, key: "avatar" });
  items.sort((m, n) => (m.lx + m.ly) - (n.lx + n.ly) || m.ly - n.ly);

  const lib = (k) => PROP_LIB[k] || { h: 18, top: "#bbb", side: "#999" };

  // hue for floor wash
  const floorTint = room.floor;

  return (
    <div ref={fitRef} className="iso-fit" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div style={{ position: "relative", width: planeW, height: planeH, transformOrigin: "center center", transform: `scale(${scale})`, flex: "none" }} data-iso-plane>
        {/* ---- floor + walls (SVG) ---- */}
        <svg width={planeW} height={planeH} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <linearGradient id="wallL" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={room.color} stopOpacity="0.9" />
              <stop offset="1" stopColor={room.color} stopOpacity="0.6" />
            </linearGradient>
          </defs>
          {/* west wall (gx=0 edge) */}
          <polygon
            points={`${project(0, 0).x},${project(0, 0).y - WALL} ${project(0, room.h).x},${project(0, room.h).y - WALL} ${project(0, room.h).x},${project(0, room.h).y} ${project(0, 0).x},${project(0, 0).y}`}
            fill={room.color} opacity="0.34" />
          {/* north wall (gy=0 edge) */}
          <polygon
            points={`${project(0, 0).x},${project(0, 0).y - WALL} ${project(room.w, 0).x},${project(room.w, 0).y - WALL} ${project(room.w, 0).x},${project(room.w, 0).y} ${project(0, 0).x},${project(0, 0).y}`}
            fill={room.color} opacity="0.5" />
          {/* floor tiles */}
          {tiles.map((t) => (
            <polygon key={`${t.i}-${t.j}`} points={t.pts}
              fill={t.checker ? floorTint : `color-mix(in oklab, ${floorTint} 80%, #fff 20%)`}
              stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
          ))}
          {/* floor sheen */}
          <polygon
            points={`${project(0, 0).x},${project(0, 0).y} ${project(room.w, 0).x},${project(room.w, 0).y} ${project(room.w, room.h).x},${project(room.w, room.h).y} ${project(0, room.h).x},${project(0, room.h).y}`}
            fill="rgba(255,255,255,0.05)" />
        </svg>

        {/* ---- props + characters ---- */}
        {items.map((it, idx) => {
          const c = project(it.lx + 0.5, it.ly + 0.5);
          const z = idx + 10;
          if (it.type === "prop") {
            const L = lib(it.p.kind);
            const pw = (it.p.w || 1), pd = (it.p.h || 1);
            return <IsoProp key={it.key} kind={it.p.kind} L={L} cx={c.x} cy={c.y} z={z} />;
          }
          if (it.type === "npc") {
            return (
              <div key={it.key} style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-86%)", zIndex: z }}>
                <Sprite hue={it.n.hue} kind="npc" state="idle" size={46} />
                <Nameplate label={it.n.name} sub={it.n.role} tone="npc" />
              </div>
            );
          }
          if (it.type === "aide") {
            return (
              <div key={it.key} style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-90%)", zIndex: z }}>
                <Sprite hue={142} kind="aide" state="working" size={52} talking={avatar.state === "coached"} />
                <Nameplate label={aide.name} sub="Aide" tone="aide" />
              </div>
            );
          }
          // avatar
          return (
            <div key={it.key} style={{ position: "absolute", left: c.x, top: c.y, transform: "translate(-50%,-92%)", zIndex: z + 1 }}>
              {showCrystal && (
                <div style={{ position: "absolute", left: "50%", top: -34, transform: "translateX(-50%)" }}>
                  <MoodCrystal score={window.NLT_wellbeing(avatar)} shape={crystalShape} size={26} />
                </div>
              )}
              {showThought && thought && (
                <div className="iso-thought" key={thought}>
                  {thought}
                  <span className="iso-thought-tail" />
                </div>
              )}
              <Sprite hue={avatar.hue} kind="avatar" state={avatar.state} size={62}
                facing={avatar.facing} talking={false} />
              <Nameplate label={avatar.name} sub={window.NLT_STATE_LABEL[avatar.state]} tone="avatar"
                stateColor={window.NLT_STATE_COLOR[avatar.state]} />
              {/* selection ring */}
              <div style={{
                position: "absolute", bottom: -2, left: "50%", transform: "translateX(-50%)",
                width: 56, height: 22, borderRadius: "50%", border: "2.5px solid var(--gold)",
                opacity: 0.85,
              }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IsoProp({ kind, L, cx, cy, z }) {
  const w = TILE * 1.4, top = L.h;
  return (
    <div style={{ position: "absolute", left: cx, top: cy, transform: "translate(-50%,-100%)", zIndex: z }}>
      <div style={{ position: "relative", width: w, height: top + TILE * 0.7 }}>
        {/* top face (diamond) */}
        <div style={{
          position: "absolute", left: "50%", top: 0, transform: "translateX(-50%) rotate(45deg) scaleY(0.5)",
          width: w * 0.62, height: w * 0.62, background: L.top, borderRadius: 5,
          boxShadow: L.glow ? `0 0 12px ${L.glow}` : "inset 0 0 0 1px rgba(255,255,255,.2)",
        }} />
        {/* body sides */}
        <div style={{
          position: "absolute", left: "50%", top: top * 0.5, transform: "translateX(-50%)",
          width: w * 0.5, height: top, background: L.side, borderRadius: "0 0 6px 6px",
          opacity: 0.92,
        }} />
        {L.leaf && (
          <div style={{ position: "absolute", left: "50%", top: -6, transform: "translateX(-50%)", fontSize: 0 }}>
            <div style={{ width: 18, height: 18, background: L.top, borderRadius: "50% 50% 50% 0", transform: "rotate(45deg)", boxShadow: "inset -2px -2px 0 rgba(0,0,0,.12)" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function Nameplate({ label, sub, tone = "avatar", stateColor }) {
  const bg = tone === "aide" ? "var(--calm)" : tone === "npc" ? "var(--ink-2)" : "var(--ink)";
  return (
    <div style={{
      position: "absolute", bottom: -22, left: "50%", transform: "translateX(-50%)",
      display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      background: bg, color: "#fff", padding: "2px 8px", borderRadius: 999,
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 10.5,
      boxShadow: "0 3px 8px rgba(60,45,20,.28)",
    }}>
      {label}
      {sub && <span style={{ opacity: 0.7, fontWeight: 500, fontSize: 9.5, color: stateColor || "rgba(255,255,255,.85)" }}>· {sub}</span>}
    </div>
  );
}

Object.assign(window, { IsoStage });
