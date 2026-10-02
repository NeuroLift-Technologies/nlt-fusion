// HUD panels — avatar state, event stream, aide log, scenarios, fleet, progress.
// Composable cards used in the main layout.

const WE_HUD = (function () {
  const WE = window.WE_DATA;

  // ------------- Top bar ----------------
  function TopBar({ simTime, tickCount, running, onToggle, onReset, onStep, accent }) {
    const hh = Math.floor(simTime / 60) % 24;
    const mm = Math.floor(simTime) % 60;
    const ss = Math.floor((simTime % 1) * 60);
    const clock = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
    return (
      <div className="we-topbar">
        <div className="we-brand">
          <div className="we-brand-mark" style={{ background: accent }}>
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M4 12 L9 7 L9 17 Z M15 7 L20 12 L15 17 Z M9 7 L15 17 M9 17 L15 7" stroke="white" strokeWidth="1.4" fill="none" />
            </svg>
          </div>
          <div className="we-brand-text">
            <span className="we-brand-name">WORLD ENGINE</span>
            <span className="we-brand-sub">NeuroLift · phase 02 — simulation core</span>
          </div>
        </div>
        <div className="we-clock">
          <span className="we-clock-label">SIM TIME</span>
          <span className="we-clock-time">{clock}</span>
          <span className="we-clock-tick">tick {tickCount.toLocaleString()}</span>
        </div>
        <div className="we-controls">
          <button className="we-btn" onClick={onStep}>▷ step</button>
          <button className={`we-btn primary ${running ? 'running' : ''}`} onClick={onToggle}>
            {running ? '❚❚ pause' : '▶ resume'}
          </button>
          <button className="we-btn ghost" onClick={onReset}>↺ reset</button>
        </div>
      </div>
    );
  }

  // ------------- Avatar state card ----------------
  function AvatarStateCard({ av }) {
    if (!av) return <div className="we-card we-empty">no avatar selected</div>;
    const aide = WE.AIDES[av.id];
    const sc = av.scenarioId ? WE.SCENARIOS.find(s => s.id === av.scenarioId) : null;
    const room = WE.ROOMS.find(r => r.id === av.room);
    return (
      <div className="we-card we-state">
        <div className="we-state-head">
          <div className="we-state-portrait" style={{ background: `hsl(${av.hue} 70% 55%)` }}>
            <span>{av.tag}</span>
          </div>
          <div className="we-state-id">
            <div className="we-state-name">{av.name}</div>
            <div className="we-state-trait">{av.trait}</div>
            <div className="we-state-blurb">"{av.blurb}"</div>
          </div>
          <div className={`we-state-tag state-${av.state}`}>{av.state}</div>
        </div>

        <div className="we-bars">
          <Bar label="Focus"          v={av.focus}    hue={170} />
          <Bar label="Cognitive Load" v={av.cogLoad}  hue={28}  inv />
          <Bar label="Stress"         v={av.stress}   hue={350} inv />
          <Bar label="Burnout Risk"   v={av.burnout}  hue={0}   inv danger={0.7} />
        </div>

        <div className="we-state-meta">
          <Meta label="Room"        value={room ? room.name : '—'} />
          <Meta label="Scenario"    value={sc ? sc.name : 'idle'} />
          <Meta label="Progress"    value={sc ? `${Math.min(av.elapsed, av.expected).toFixed(0)} / ${av.expected} min` : '—'} />
          <Meta label="Aide"        value={aide ? aide.name : '—'} />
          <Meta label="Interventions" value={av.interventions} />
          <Meta label="Successes"     value={`${av.successes} / ${av.successes + av.failures || '0'}`} />
        </div>

        {sc && (
          <div className="we-scenario-bar">
            <div className="we-scenario-fill" style={{ width: `${Math.min(100, (av.elapsed / av.expected) * 100)}%` }} />
            <span>{sc.name}</span>
          </div>
        )}
      </div>
    );
  }

  function Bar({ label, v, hue = 200, inv = false, danger = null }) {
    const pct = Math.round(v * 100);
    const isDanger = danger !== null && v >= danger;
    return (
      <div className={`we-bar ${inv ? 'inv' : ''} ${isDanger ? 'danger' : ''}`}>
        <div className="we-bar-label">
          <span>{label}</span>
          <span className="we-bar-pct">{pct}%</span>
        </div>
        <div className="we-bar-track">
          <div className="we-bar-fill" style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, hsl(${hue} 70% 45%), hsl(${hue} 80% 60%))`
          }} />
        </div>
      </div>
    );
  }

  function Meta({ label, value }) {
    return (
      <div className="we-meta-cell">
        <div className="we-meta-label">{label}</div>
        <div className="we-meta-value">{value}</div>
      </div>
    );
  }

  // ------------- Event stream ----------------
  function EventStream({ events, accent }) {
    return (
      <div className="we-card we-stream">
        <div className="we-card-head">
          <span className="we-card-title">EVENT STREAM</span>
          <span className="we-card-sub">{events.length} events</span>
        </div>
        <div className="we-stream-list">
          {events.slice(0, 40).map(e => (
            <div key={e.id} className={`we-evt evt-${e.kind}`}>
              <span className="evt-dot" style={{ background: `hsl(${e.avatarHue} 70% 55%)` }} />
              <span className="evt-kind">{e.kind}</span>
              <span className="evt-name">{e.avatarName}</span>
              <span className="evt-text">{e.text}</span>
            </div>
          ))}
          {events.length === 0 && <div className="we-empty">waiting for tick…</div>}
        </div>
      </div>
    );
  }

  // ------------- Aide coaching log ----------------
  function AideLog({ interventions }) {
    return (
      <div className="we-card we-aide-log">
        <div className="we-card-head">
          <span className="we-card-title">AIDE COACHING LOG</span>
          <span className="we-card-sub">{interventions.length} interventions</span>
        </div>
        <div className="we-aide-list">
          {interventions.slice(0, 8).map(i => (
            <div key={i.id} className="we-aide-card">
              <div className="we-aide-head">
                <span className="we-aide-name">{i.aide}</span>
                <span className="we-aide-arrow">→</span>
                <span className="we-aide-target" style={{ color: `hsl(${i.avatarHue} 70% 65%)` }}>
                  {i.avatarName}
                </span>
              </div>
              <div className="we-aide-strategy">"{i.strategy}"</div>
              <div className="we-aide-meter">
                <div className="we-aide-meter-fill" style={{ width: `${Math.round(i.effectiveness * 100)}%` }} />
                <span>{Math.round(i.effectiveness * 100)}% effective</span>
              </div>
            </div>
          ))}
          {interventions.length === 0 && <div className="we-empty">no interventions yet</div>}
        </div>
      </div>
    );
  }

  // ------------- Fleet roster ----------------
  function FleetRoster({ avatars, selectedId, onSelect, compact = false }) {
    return (
      <div className={`we-card we-fleet ${compact ? 'compact' : ''}`}>
        <div className="we-card-head">
          <span className="we-card-title">AVATAR FLEET · 19</span>
          <span className="we-card-sub">{avatars.filter(a => a.scenarioId).length} in scenario</span>
        </div>
        <div className="we-fleet-grid">
          {avatars.map(av => {
            const urgency = Math.max(av.stress, av.cogLoad, 1 - av.focus);
            return (
              <button key={av.id}
                className={`we-fleet-cell ${selectedId === av.id ? 'sel' : ''} ${av.scenarioId ? 'active' : ''}`}
                onClick={() => onSelect(av.id)}>
                <div className="we-fleet-portrait" style={{ background: `hsl(${av.hue} 70% 55%)` }}>
                  <span>{av.tag}</span>
                </div>
                <div className="we-fleet-name">{av.name}</div>
                <div className="we-fleet-trait">{av.trait}</div>
                <div className="we-fleet-spark">
                  <span className="spk focus"    style={{ height: `${av.focus * 100}%` }} title="focus" />
                  <span className="spk load"     style={{ height: `${av.cogLoad * 100}%` }} title="load" />
                  <span className="spk stress"   style={{ height: `${av.stress * 100}%` }} title="stress" />
                  <span className="spk burnout"  style={{ height: `${av.burnout * 100}%` }} title="burnout" />
                </div>
                <div className={`we-fleet-status urgency-${urgency > 0.7 ? 'crit' : urgency > 0.5 ? 'warn' : 'ok'}`}>
                  {av.state}
                </div>
                <div className="we-fleet-fusion" title="fusion readiness">
                  <div style={{ width: `${av.fusionReady * 100}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ------------- Scenario picker ----------------
  function ScenarioControls({ avatar, onAssign, dysfunctionOn }) {
    if (!avatar) return null;
    return (
      <div className="we-card we-scenario">
        <div className="we-card-head">
          <span className="we-card-title">SCENARIO LIBRARY</span>
          <span className="we-card-sub">{WE.SCENARIOS.length} available</span>
        </div>
        <div className="we-scenario-grid">
          {WE.SCENARIOS.map(sc => (
            <button key={sc.id} className={`we-scenario-cell cat-${sc.cat}`}
              onClick={() => onAssign(avatar.id, sc.id)}>
              <span className="sc-name">{sc.name}</span>
              <span className="sc-room">{sc.cat} · {sc.minutes}m</span>
              <span className="sc-tags">
                {sc.sustained && <em>focus</em>}
                <em>cog {Math.round(sc.cog * 10)}/10</em>
                <em>av {Math.round(sc.aversive * 10)}/10</em>
              </span>
            </button>
          ))}
        </div>
        <div className="we-dys-indicator">
          dysfunction injection: <strong className={dysfunctionOn ? 'on' : 'off'}>
            {dysfunctionOn ? 'ON' : 'OFF'}
          </strong>
        </div>
      </div>
    );
  }

  // ------------- NPC roster ----------------
  function NpcRoster() {
    return (
      <div className="we-card we-npcs">
        <div className="we-card-head">
          <span className="we-card-title">NPC ROSTER</span>
          <span className="we-card-sub">{WE.NPCS.length} characters</span>
        </div>
        <div className="we-npc-list">
          {WE.NPCS.map(npc => (
            <div key={npc.id} className="we-npc">
              <div className="we-npc-portrait" style={{ background: `hsl(${npc.hue} 60% 55%)` }} />
              <div className="we-npc-meta">
                <div className="we-npc-name">{npc.name}</div>
                <div className="we-npc-role">{npc.role}</div>
              </div>
              <div className={`we-npc-bias ${npc.biased ? 'biased' : 'neutral'}`}>
                {npc.biased ? 'biased' : 'neutral'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ------------- Progress curves ----------------
  function ProgressPanel({ avatar }) {
    if (!avatar) return null;
    const total = avatar.successes + avatar.failures;
    const winRate = total > 0 ? avatar.successes / total : 0;
    return (
      <div className="we-card we-progress">
        <div className="we-card-head">
          <span className="we-card-title">LEARNING CURVE</span>
          <span className="we-card-sub">{avatar.name}</span>
        </div>
        <div className="we-progress-cells">
          <BigStat label="Independence" v={avatar.independence} hue={170} />
          <BigStat label="Success Rate" v={winRate} hue={120} />
          <BigStat label="Fusion Ready" v={avatar.fusionReady} hue={50} />
        </div>
        <div className="we-fusion-bar">
          <span className="lbl">Avatar → Advocate fusion</span>
          <div className="track">
            <div className="fill" style={{ width: `${avatar.fusionReady * 100}%` }} />
            <div className="marker" style={{ left: '60%' }} />
            <div className="marker" style={{ left: '85%' }} />
          </div>
          <div className="ticks">
            <span>baseline</span><span>candidate</span><span>fusion</span>
          </div>
        </div>
      </div>
    );
  }

  function BigStat({ label, v, hue }) {
    return (
      <div className="we-bigstat">
        <div className="we-bigstat-num" style={{ color: `hsl(${hue} 80% 65%)` }}>
          {Math.round(v * 100)}<small>%</small>
        </div>
        <div className="we-bigstat-label">{label}</div>
        <div className="we-bigstat-bar">
          <div style={{ width: `${v * 100}%`, background: `hsl(${hue} 70% 55%)` }} />
        </div>
      </div>
    );
  }

  return {
    TopBar, AvatarStateCard, EventStream, AideLog,
    FleetRoster, ScenarioControls, NpcRoster, ProgressPanel,
  };
})();

window.WE_HUD = WE_HUD;
