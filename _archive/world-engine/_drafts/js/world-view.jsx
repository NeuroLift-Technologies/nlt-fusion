// world-view.jsx — themable isometric world renderer.
// Exports (to window): WorldView.
// Theme is controlled by the CSS variables on the wrapper element passed in props.
// Pure SVG so it composites cleanly across themes.

window.WorldView = (function () {
  const WE = window.WE_DATA;
  const TW = 28;   // half tile width  (in px, base — wrapper can scale)
  const TH = 14;   // half tile height
  const iso = (x, y) => ({ sx: (x - y) * TW, sy: (x + y) * TH });

  // Per-theme prop palette. The renderer reads these from CSS vars when present;
  // otherwise falls back to these defaults.
  const PROP_DEFAULTS = {
    desk:       { color: '#5a4a3a', h: 12 },
    longtable:  { color: '#5a4a3a', h: 12 },
    table:      { color: '#5a4a3a', h: 12 },
    monitor:    { color: '#1a2330', h: 18 },
    screen:     { color: '#0c1320', h: 26 },
    whiteboard: { color: '#f0eee8', h: 28 },
    chair:      { color: '#3a3a4a', h: 14 },
    plant:      { color: '#3a8a4a', h: 22 },
    sofa:       { color: '#6a4a6a', h: 14 },
    tv:         { color: '#1a2330', h: 18 },
    counter:    { color: '#6a5a4a', h: 16 },
    fridge:     { color: '#d8d4c8', h: 28 },
    phone:      { color: '#c2884a', h: 18 },
  };

  function shade(hex, pct) {
    const n = parseInt(hex.replace('#', ''), 16);
    let r = Math.max(0, Math.min(255, (n >> 16) + pct));
    let g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + pct));
    let b = Math.max(0, Math.min(255, (n & 0xff) + pct));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  // Renders a single isometric tile as an SVG polygon.
  function TilePoly({ x, y, fill, stroke }) {
    const { sx, sy } = iso(x, y);
    const cx = sx, cy = sy + TH;
    const points = `${cx},${cy - TH} ${cx + TW},${cy} ${cx},${cy + TH} ${cx - TW},${cy}`;
    return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={0.5} />;
  }

  // Iso prop drawn as a top diamond + L/R sides (cheap 3D).
  function PropIso({ prop, room, sprite }) {
    const x = room.x + prop.x;
    const y = room.y + prop.y;
    const w = prop.w || 1;
    const h = prop.h || 1;
    const def = PROP_DEFAULTS[prop.kind] || { color: '#666', h: 10 };
    const height = def.h;
    const color = def.color;

    // bottom diamond center
    const { sx, sy } = iso(x + (w - 1) / 2, y + (h - 1) / 2);

    // top diamond corners (lifted by height)
    const cx = sx, cy = sy + TH - height;
    const halfW = TW * w;
    const halfH = TH * h;
    const top = `${cx},${cy - halfH} ${cx + halfW},${cy} ${cx},${cy + halfH} ${cx - halfW},${cy}`;

    // left side (front-left): from bottom-left of top-diamond down by height
    const leftPts = `${cx - halfW},${cy} ${cx},${cy + halfH} ${cx},${cy + halfH + height} ${cx - halfW},${cy + height}`;
    const rightPts = `${cx + halfW},${cy} ${cx},${cy + halfH} ${cx},${cy + halfH + height} ${cx + halfW},${cy + height}`;

    return (
      <g className={`we-prop kind-${prop.kind}`}>
        <polygon points={leftPts} fill={shade(color, -28)} />
        <polygon points={rightPts} fill={shade(color, -16)} />
        <polygon points={top} fill={color} stroke={shade(color, -40)} strokeWidth={0.6} />
        {prop.kind === 'monitor' && (
          <polygon points={top} fill="url(#we-monitor-glow)" opacity={0.7} />
        )}
        {prop.kind === 'screen' && (
          <polygon points={top} fill="url(#we-monitor-glow)" opacity={0.85} />
        )}
        {prop.kind === 'whiteboard' && (
          <polygon points={top} fill="#f6f3eb" />
        )}
      </g>
    );
  }

  // A Sims-style character with rounded head + body. SVG-based, themable via stroke/fill.
  function Character({ wx, wy, hue, label, state, selected, showLabel, sprite = 'rounded', onClick }) {
    const { sx, sy } = iso(wx, wy);
    const bodyColor = `hsl(${hue} 65% 55%)`;
    const bodyDk = `hsl(${hue} 55% 38%)`;
    const headColor = `hsl(${hue} 30% 78%)`;

    const stateIcon = ({
      drifting:    '…',
      hyperfocus:  '◉',
      overwhelmed: '!',
      coached:     '✦',
      working:     '▸',
    })[state];

    const bubbleColor = ({
      drifting:    'var(--we-warn, #fbbf24)',
      hyperfocus:  'var(--we-info, #67e8f9)',
      overwhelmed: 'var(--we-bad, #ef4444)',
      coached:     'var(--we-good, #4ade80)',
    })[state] || 'var(--we-accent, #f5a623)';

    if (sprite === 'pixel') {
      // 8-bit chunky sprite — column of squares.
      return (
        <g className={`we-pixchar state-${state || 'idle'} ${selected ? 'sel' : ''}`}
           transform={`translate(${sx}, ${sy})`}
           onClick={onClick} style={{ cursor: 'pointer' }}>
          <ellipse cx={0} cy={2} rx={8} ry={2.4} fill="rgba(0,0,0,0.45)" />
          {selected && <ellipse cx={0} cy={2} rx={11} ry={3.4} fill="none" stroke="var(--we-accent, #f5a623)" strokeWidth={1.2} strokeDasharray="2 2" />}
          {/* body — 6x6 + head 6x6 */}
          <rect x={-5} y={-12} width={10} height={8} fill={bodyColor} />
          <rect x={-5} y={-12} width={10} height={2} fill={`hsl(${hue} 80% 70%)`} />
          <rect x={-4} y={-20} width={8} height={8} fill={headColor} />
          <rect x={-2} y={-17} width={1.5} height={1.5} fill="#111" />
          <rect x={0.5} y={-17} width={1.5} height={1.5} fill="#111" />
          {stateIcon && (
            <g transform="translate(8 -22)">
              <rect x={-7} y={-7} width={14} height={12} fill="var(--we-panel, #0e131c)" stroke={bubbleColor} strokeWidth={1.2} />
              <text x={0} y={2} textAnchor="middle" fill={bubbleColor} fontSize={9} fontFamily="'Press Start 2P', monospace">{stateIcon}</text>
            </g>
          )}
          {showLabel && label && (
            <g transform={`translate(0 12)`}>
              <rect x={-22} y={-1} width={44} height={9} fill="rgba(0,0,0,0.7)" />
              <text x={0} y={6} textAnchor="middle" fill="#fff" fontSize={6} fontFamily="'Press Start 2P', monospace" letterSpacing="0.5">{label.toUpperCase()}</text>
            </g>
          )}
        </g>
      );
    }

    // rounded (default Sims-ish) sprite
    return (
      <g className={`we-char state-${state || 'idle'} ${selected ? 'sel' : ''}`}
         transform={`translate(${sx}, ${sy})`}
         onClick={onClick} style={{ cursor: 'pointer' }}>
        <ellipse cx={0} cy={2} rx={9} ry={2.6} fill="rgba(0,0,0,0.45)" />
        {selected && (
          <ellipse cx={0} cy={2} rx={13} ry={4.2} fill="none"
                   stroke="var(--we-accent, #f5a623)" strokeWidth={1.6}>
            <animate attributeName="rx" values="13;15;13" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="1.4s" repeatCount="indefinite" />
          </ellipse>
        )}
        {/* body */}
        <path d={`M -7 -1 Q -7 -14 0 -14 Q 7 -14 7 -1 L 7 1 Q 0 3 -7 1 Z`} fill={bodyColor} />
        <path d={`M -7 -1 Q -7 -14 0 -14 Q 7 -14 7 -1 Z`} fill="none" stroke={bodyDk} strokeWidth={0.6} />
        {/* shirt accent */}
        <rect x={-3} y={-12} width={6} height={2} rx={1} fill={`hsl(${hue} 80% 70%)`} />
        {/* head */}
        <circle cx={0} cy={-18} r={5.5} fill={headColor} />
        <circle cx={0} cy={-18} r={5.5} fill="none" stroke={shade('#000000', 30)} strokeWidth={0.4} opacity={0.3} />
        {/* eyes */}
        <circle cx={-1.6} cy={-18.5} r={0.6} fill="#111" />
        <circle cx={1.6} cy={-18.5} r={0.6} fill="#111" />
        {/* state bubble */}
        {stateIcon && (
          <g transform="translate(8 -22)">
            <circle cx={0} cy={0} r={6.5} fill="var(--we-panel, #0e131c)" stroke={bubbleColor} strokeWidth={1.1} />
            <text x={0} y={2.6} textAnchor="middle" fill={bubbleColor} fontSize={8} fontFamily="ui-monospace, monospace" fontWeight="700">{stateIcon}</text>
          </g>
        )}
        {/* label */}
        {showLabel && label && (
          <g transform={`translate(0 10)`}>
            <rect x={-22} y={-1} width={44} height={9} rx={2} fill="rgba(0,0,0,0.62)" />
            <text x={0} y={5.6} textAnchor="middle" fill="#fff" fontSize={6.4}
                  fontFamily="ui-sans-serif, system-ui" fontWeight="600" letterSpacing="0.4">{label}</text>
          </g>
        )}
      </g>
    );
  }

  // An Aide is rendered as a coach figure — softer/lighter than Avatars, with a
  // clipboard icon. When `coaching` is true, a dialog bubble appears above with
  // the current strategy. Aides do not respond to clicks (they're observed).
  function AideCharacter({ wx, wy, name, coaching, strategy, sprite = 'rounded' }) {
    const { sx, sy } = iso(wx, wy);
    const robe = '#cfd4e0';
    const robeDk = '#7a8194';
    const accent = 'var(--we-info, #67e8f9)';

    return (
      <g className={`we-aide ${coaching ? 'is-coaching' : ''}`} transform={`translate(${sx}, ${sy})`}>
        <ellipse cx={0} cy={2} rx={9} ry={2.6} fill="rgba(0,0,0,0.45)" />
        {coaching && (
          <ellipse cx={0} cy={2} rx={13} ry={4.2} fill="none" stroke={accent} strokeWidth={1.4}>
            <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
          </ellipse>
        )}
        {/* longer robe-ish body */}
        <path d="M -8 1 Q -8 -14 0 -14 Q 8 -14 8 1 L 8 3 Q 0 4 -8 3 Z" fill={robe} stroke={robeDk} strokeWidth={0.6} />
        <rect x={-4} y={-11} width={8} height={1.6} fill={accent} opacity={0.85} />
        {/* head */}
        <circle cx={0} cy={-18} r={5.4} fill="#e8dac4" />
        <circle cx={0} cy={-18} r={5.4} fill="none" stroke="#6b5a40" strokeWidth={0.35} opacity={0.4} />
        <circle cx={-1.6} cy={-18.4} r={0.55} fill="#222" />
        <circle cx={1.6} cy={-18.4} r={0.55} fill="#222" />
        {/* clipboard tucked under arm */}
        <g transform="translate(7 -6)">
          <rect x={-2} y={-3} width={4} height={6} fill="#fff8e6" stroke="#6b5a40" strokeWidth={0.4} />
          <rect x={-1.5} y={-2.4} width={3} height={0.5} fill="#6b5a40" />
          <rect x={-1.5} y={-1.2} width={3} height={0.4} fill="#a89878" />
          <rect x={-1.5} y={0} width={3} height={0.4} fill="#a89878" />
        </g>
        {/* coaching dialog */}
        {coaching && strategy && (
          <g transform="translate(14 -28)">
            <rect x={-2} y={-12} width={140} height={22} rx={5}
                  fill="rgba(11,15,23,0.92)" stroke={accent} strokeWidth={0.9} />
            <polygon points="-2,-2 -8,2 -2,4" fill="rgba(11,15,23,0.92)" stroke={accent} strokeWidth={0.9} />
            <text x={5} y={-2} fill={accent} fontSize={6} fontFamily="ui-monospace, monospace"
                  letterSpacing="0.6" fontWeight="700">{(name || 'AIDE').toUpperCase()}</text>
            <text x={5} y={6} fill="#e6ecf5" fontSize={7.2} fontFamily="ui-sans-serif, system-ui"
                  fontStyle="italic">"{strategy.length > 38 ? strategy.slice(0, 36) + '…' : strategy}"</text>
          </g>
        )}
        {name && (
          <g transform="translate(0 10)">
            <rect x={-22} y={-1} width={44} height={9} rx={2} fill="rgba(255,248,230,0.92)" />
            <text x={0} y={5.6} textAnchor="middle" fill="#2c241a" fontSize={6.2}
                  fontFamily="ui-sans-serif, system-ui" fontWeight="600" letterSpacing="0.4">{name}</text>
          </g>
        )}
      </g>
    );
  }

  // Main world renderer. Accepts an array of avatars (sim runtime state),
  // selected avatar id, theme name (rooms tint), sprite name, scale, showLabels.
  // Optional camera prop: { room: 'office' } crops viewBox to that room + padding.
  // Optional aides prop: array of avatar IDs to render an Aide character beside.
  // Optional coaching prop: { avatarId, strategy } shows a coaching dialog over the Aide.
  function WorldView({ avatars, selectedId, onSelect, theme = 'mission', sprite = 'rounded',
                      scale = 1, showLabels = true, camera = null,
                      aides = null, coaching = null }) {

    // Compute viewport: world extent in screen px.
    const maxX = 24, maxY = 18;
    let minSx, maxSx, minSy, maxSy;
    if (camera && camera.room) {
      const room = WE.ROOMS.find(r => r.id === camera.room);
      if (room) {
        const padX = camera.padX != null ? camera.padX : 1.5;
        const padY = camera.padY != null ? camera.padY : 1.5;
        const x0 = room.x - padX, x1 = room.x + room.w + padX;
        const y0 = room.y - padY, y1 = room.y + room.h + padY;
        const cs = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)];
        minSx = Math.min(...cs.map(c => c.sx));
        maxSx = Math.max(...cs.map(c => c.sx));
        minSy = Math.min(...cs.map(c => c.sy)) - 26; // headroom for sprite tops
        maxSy = Math.max(...cs.map(c => c.sy)) + 14;
      }
    }
    if (minSx == null) {
      const corners = [iso(0, 0), iso(maxX, 0), iso(maxX, maxY), iso(0, maxY)];
      minSx = Math.min(...corners.map(c => c.sx)) - TW * 2;
      maxSx = Math.max(...corners.map(c => c.sx)) + TW * 2;
      minSy = Math.min(...corners.map(c => c.sy)) - TH * 4;
      maxSy = Math.max(...corners.map(c => c.sy)) + TH * 4;
    }
    const vbW = maxSx - minSx;
    const vbH = maxSy - minSy;

    // theme tints for rooms — override the default room.color/floor
    const ROOM_TINT = ({
      mission:  { office: ['#1a3a5a','#0e2240'], meeting:['#3a2a6a','#22154a'], home: ['#1f5c4a','#0e3326'], phone: ['#5a3b1d','#3a230f'], lounge:['#5a2b48','#2e0f26'] },
      habitat:  { office: ['#cbd9c8','#9bb39a'], meeting:['#d8cbb3','#a89878'], home: ['#e3d3b0','#b39d72'], phone: ['#d6bfa3','#a4886a'], lounge:['#d4bcc8','#9b7d8e'] },
      bridge:   { office: ['#3a2b15','#1f1608'], meeting:['#3a1f1f','#1f0e0e'], home: ['#2a311b','#171c0e'], phone: ['#3a2a15','#1f1408'], lounge:['#3a1a30','#1f0d1c'] },
      pixel:    { office: ['#3a6ba8','#1f3d6b'], meeting:['#7a4ec2','#3a235a'], home: ['#3a9a6a','#1e5839'], phone: ['#c2884a','#7a4a16'], lounge:['#c25577','#7a2e44'] },
    })[theme] || {};

    const flatTiles = [];
    const roomLabels = [];
    WE.ROOMS.forEach(room => {
      const tint = ROOM_TINT[room.id] || [room.floor, shade(room.floor, -10)];
      for (let y = 0; y < room.h; y++) {
        for (let x = 0; x < room.w; x++) {
          const isOdd = (x + y) % 2 === 0;
          flatTiles.push({
            key: `${room.id}-${x}-${y}`,
            x: room.x + x, y: room.y + y,
            fill: isOdd ? tint[0] : tint[1],
            stroke: shade(tint[1], -25),
          });
        }
      }
      // label position above the room
      const label = iso(room.x + room.w / 2 - 0.5, room.y - 0.5);
      roomLabels.push({ id: room.id, name: room.name, color: room.color, sx: label.sx, sy: label.sy });
    });

    // Depth-sorted props + characters.
    const propsSorted = WE.ROOMS.flatMap(room =>
      room.props.map((p, i) => ({ p, room, key: room.id + '-pp-' + i, sortY: (room.y + (p.y || 0)) }))
    ).sort((a, b) => a.sortY - b.sortY);

    // If a camera is set, hide entities that aren't inside that room.
    const inCamera = (wx, wy) => {
      if (!camera || !camera.room) return true;
      const room = WE.ROOMS.find(r => r.id === camera.room);
      if (!room) return true;
      const pad = 2;
      return wx >= room.x - pad && wx <= room.x + room.w + pad &&
             wy >= room.y - pad && wy <= room.y + room.h + pad;
    };

    const charsSorted = [
      ...avatars.map(av => ({
        kind: 'avatar', id: av.id, wx: av.px, wy: av.py,
        hue: av.hue, name: av.name, state: av.state,
        selected: av.id === selectedId, sortY: av.py,
      })),
      ...WE.NPCS.filter(n => !n.invisible).map(npc => {
        const room = WE.ROOMS.find(r => r.id === npc.room);
        if (!room) return null;
        return {
          kind: 'npc', id: 'npc-' + npc.id,
          wx: room.x + npc.x, wy: room.y + npc.y,
          hue: npc.hue, name: npc.name, state: npc.biased ? 'biased' : 'npc',
          biased: npc.biased, sortY: room.y + npc.y,
        };
      }).filter(Boolean),
    ].filter(c => inCamera(c.wx, c.wy)).sort((a, b) => a.sortY - b.sortY);

    // Build Aide entities — paired 1:1 with their Avatar, placed offset by (+1, +1).
    const aideList = (aides || []).map(avId => {
      const av = avatars.find(a => a.id === avId);
      if (!av) return null;
      const aide = WE.AIDES[avId];
      if (!aide) return null;
      const wx = av.px + 1.2;
      const wy = av.py + 0.6;
      const isCoaching = coaching && coaching.avatarId === avId;
      return {
        id: 'aide-' + avId,
        wx, wy,
        name: aide.name,
        coaching: isCoaching,
        strategy: isCoaching ? coaching.strategy : null,
        sortY: wy + 0.01, // draw just after the paired avatar
      };
    }).filter(Boolean).filter(a => inCamera(a.wx, a.wy));

    return (
      <svg className={`world-svg theme-${theme}`}
           viewBox={`${minSx} ${minSy} ${vbW} ${vbH}`}
           preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="we-monitor-glow" cx="0.5" cy="0.3">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#1a4a7a" stopOpacity="0.3" />
          </radialGradient>
          <filter id="we-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
        </defs>

        {/* floor tiles */}
        <g className="we-floor">
          {flatTiles.map(t => (
            <TilePoly key={t.key} x={t.x} y={t.y} fill={t.fill} stroke={t.stroke} />
          ))}
        </g>

        {/* room labels */}
        <g className="we-room-labels">
          {roomLabels.map(r => (
            <g key={r.id} transform={`translate(${r.sx}, ${r.sy - 6})`}>
              <rect x={-26} y={-7} width={52} height={11} rx={2}
                    fill="rgba(0,0,0,0.55)" />
              <circle cx={-19} cy={-1.5} r={2} fill={r.color} />
              <text x={-14} y={2} fill="#e6ecf5" fontSize={6.2}
                    fontFamily="ui-monospace, monospace" letterSpacing="0.7"
                    fontWeight="600">{r.name.toUpperCase()}</text>
            </g>
          ))}
        </g>

        {/* props + characters interleaved by depth */}
        <g className="we-objects">
          {(() => {
            // Interleave: items below a character draw first, then character.
            const items = [
              ...propsSorted.map(pp => ({ kind: 'prop', ...pp })),
              ...charsSorted.map(c => ({ kind: c.kind === 'avatar' ? 'avatar' : 'npc', char: c, sortY: c.sortY })),
              ...aideList.map(a => ({ kind: 'aide', aide: a, sortY: a.sortY })),
            ].sort((a, b) => a.sortY - b.sortY);
            return items.map((item, i) => {
              if (item.kind === 'prop') {
                return <PropIso key={item.key} prop={item.p} room={item.room} />;
              }
              if (item.kind === 'aide') {
                const a = item.aide;
                return (
                  <AideCharacter key={a.id}
                    wx={a.wx} wy={a.wy} name={a.name}
                    coaching={a.coaching} strategy={a.strategy}
                    sprite={sprite} />
                );
              }
              const c = item.char;
              return (
                <Character key={c.id}
                  wx={c.wx} wy={c.wy} hue={c.hue} label={c.name} state={c.state}
                  selected={c.selected} showLabel={showLabels}
                  sprite={sprite}
                  onClick={() => c.kind === 'avatar' && onSelect && onSelect(c.id)}
                />
              );
            });
          })()}
        </g>
      </svg>
    );
  }

  return { WorldView };
})().WorldView;
