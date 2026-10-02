// Isometric world renderer — rooms, props, avatars, NPCs.
// Pure CSS/SVG, no canvas. Tile-grid with iso transform.

const WE_VIEW = (function () {
  const WE = window.WE_DATA;

  // tile geometry (logical → screen px)
  const TW = 32;      // tile width  (half-diamond)
  const TH = 16;      // tile height (half-diamond)
  // iso project: screen = (x - y) * TW, (x + y) * TH
  function iso(x, y) {
    return { sx: (x - y) * TW, sy: (x + y) * TH };
  }

  function Tile({ x, y, color = '#173855', stroke = '#0a1a28', children, dark = false }) {
    const { sx, sy } = iso(x, y);
    return (
      <div className="we-tile" style={{
        left: sx, top: sy,
        background: color, borderColor: stroke,
        filter: dark ? 'brightness(0.7)' : 'none',
      }}>{children}</div>
    );
  }

  function RoomFloor({ room }) {
    const tiles = [];
    for (let y = 0; y < room.h; y++) {
      for (let x = 0; x < room.w; x++) {
        const dark = (x + y) % 2 === 0;
        tiles.push(<Tile key={`${x},${y}`} x={room.x + x} y={room.y + y}
          color={dark ? room.floor : shade(room.floor, 8)} />);
      }
    }
    // room label
    const corner = iso(room.x + room.w / 2 - 1.5, room.y - 0.5);
    return (
      <>
        {tiles}
        <div className="we-room-label" style={{ left: corner.sx, top: corner.sy }}>
          <span className="dot" style={{ background: room.color }} />
          {room.name}
        </div>
      </>
    );
  }

  function shade(hex, pct) {
    // simple hex brighten
    const n = parseInt(hex.replace('#', ''), 16);
    let r = (n >> 16) + pct, g = ((n >> 8) & 0xff) + pct, b = (n & 0xff) + pct;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  function Prop({ prop, room }) {
    const x = room.x + prop.x, y = room.y + prop.y;
    const { sx, sy } = iso(x, y);
    const w = prop.w || 1, h = prop.h || 1;
    const color = PROP_COLORS[prop.kind] || '#6b7280';
    const height = PROP_HEIGHTS[prop.kind] ?? 14;
    return (
      <div className="we-prop" style={{
        left: sx, top: sy - height,
        '--w': w, '--h': h, '--ph': height + 'px',
        '--c': color, '--c2': shade(color, -20),
      }}>
        <div className="prop-top" style={{ background: color }} />
        <div className="prop-side-l" style={{ background: shade(color, -25) }} />
        <div className="prop-side-r" style={{ background: shade(color, -15) }} />
        {prop.kind === 'monitor' && <div className="prop-screen" />}
      </div>
    );
  }

  const PROP_COLORS = {
    desk: '#5a4a3a', monitor: '#23272e', plant: '#3a8a4a', chair: '#3a3a4a',
    whiteboard: '#f0eee8', longtable: '#5a4a3a', screen: '#1a1a22',
    sofa: '#6a4a6a', tv: '#23272e', counter: '#6a5a4a', fridge: '#d8d4c8',
    phone: '#c2884a', table: '#5a4a3a',
  };
  const PROP_HEIGHTS = {
    desk: 12, monitor: 18, plant: 22, chair: 14, whiteboard: 28, longtable: 12,
    screen: 26, sofa: 14, tv: 18, counter: 16, fridge: 28, phone: 18, table: 12,
  };

  function Character({ x, y, hue, label, state, kind = 'avatar', selected = false, onClick, facing = 'south' }) {
    const { sx, sy } = iso(x, y);
    const bodyColor = `hsl(${hue} 70% 55%)`;
    const headColor = `hsl(${hue} 30% 78%)`;
    const stateClass = `state-${state || 'idle'}`;
    const stateIcon = STATE_ICONS[state] || null;
    return (
      <div className={`we-char ${stateClass} ${selected ? 'selected' : ''}`} style={{ left: sx, top: sy - 26 }}
        onClick={onClick} title={label}>
        {selected && <div className="we-char-ring" />}
        <div className="we-char-shadow" />
        <div className="we-char-body" style={{ background: bodyColor }}>
          <div className="we-char-accent" style={{ background: `hsl(${hue} 80% 70%)` }} />
        </div>
        <div className="we-char-head" style={{ background: headColor }}>
          <div className={`we-char-eyes facing-${facing}`}>
            <span /><span />
          </div>
        </div>
        {stateIcon && (
          <div className="we-char-bubble">
            <span>{stateIcon}</span>
          </div>
        )}
        {label && <div className="we-char-tag">{label}</div>}
      </div>
    );
  }

  const STATE_ICONS = {
    drifting: '…',
    hyperfocus: '◉',
    overwhelmed: '!',
    coached: '✦',
    working: '▸',
  };

  function World({ avatars, selectedId, onSelectAvatar, showLabels = true, scale = 1, panX = 0, panY = 0 }) {
    const stageRef = React.useRef(null);

    // Compute world bounds
    const maxX = 24, maxY = 18;
    const { sx: maxSx } = iso(maxX, 0);
    const { sy: maxSy } = iso(0, maxY);
    const minSx = iso(0, maxY).sx;
    const width = maxSx - minSx + TW * 4;
    const height = maxSy + TH * 4;

    return (
      <div className="we-world-stage" ref={stageRef}>
        <div className="we-world-inner" style={{
          transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
          width, height, marginLeft: -minSx
        }}>
          {/* Floor tiles per room */}
          {WE.ROOMS.map(room => (
            <RoomFloor key={room.id} room={room} />
          ))}
          {/* Props (sorted by y for fake depth) */}
          {WE.ROOMS.flatMap(room => room.props.map((p, i) => ({
            p, room, sortKey: (room.y + (p.y || 0)) * 100 + (room.x + (p.x || 0))
          })))
            .sort((a, b) => a.sortKey - b.sortKey)
            .map(({ p, room }, i) => (
              <Prop key={`${room.id}-p-${i}`} prop={p} room={room} />
            ))}
          {/* NPCs */}
          {WE.NPCS.filter(n => !n.invisible).map(npc => {
            const room = WE.ROOMS.find(r => r.id === npc.room);
            if (!room) return null;
            return (
              <Character key={npc.id}
                x={room.x + npc.x} y={room.y + npc.y}
                hue={npc.hue} label={showLabels ? npc.name : ''}
                state="npc" kind="npc" />
            );
          })}
          {/* Avatars (sorted by py for depth) */}
          {[...avatars]
            .sort((a, b) => (a.py + a.px) - (b.py + b.px))
            .map(av => (
              <Character key={av.id}
                x={av.px} y={av.py}
                hue={av.hue}
                facing={av.facing}
                label={showLabels ? av.name : ''}
                state={av.state}
                selected={av.id === selectedId}
                onClick={() => onSelectAvatar && onSelectAvatar(av.id)} />
            ))}
        </div>
      </div>
    );
  }

  return { World, iso, TW, TH };
})();

window.WE_VIEW = WE_VIEW;
