// hud.jsx — Shared HUD widgets, themable via CSS vars on parent.
// Exports (to window): Hud = { AvatarChip, StatBar, EventStream, AideLog, ScenarioPicker,
//                              NpcRoster, FleetGrid, ProgressTriple, BeatTimeline, Clock }

window.Hud = (function () {
  const WE = window.WE_DATA;

  function StatBar({ label, v, tone = 'neutral', danger = null }) {
    const pct = Math.round(v * 100);
    const isDanger = danger !== null && v >= danger;
    return (
      <div className={`hud-bar tone-${tone} ${isDanger ? 'is-danger' : ''}`}>
        <div className="hud-bar-row">
          <span className="hud-bar-label">{label}</span>
          <span className="hud-bar-pct">{pct}<small>%</small></span>
        </div>
        <div className="hud-bar-track">
          <div className="hud-bar-fill" style={{ width: pct + '%' }} />
        </div>
      </div>
    );
  }

  function Clock({ simTime, tickCount }) {
    const hh = Math.floor((simTime + 9 * 60) / 60) % 24;
    const mm = Math.floor(simTime) % 60;
    const ss = Math.floor((simTime % 1) * 60);
    return (
      <div className="hud-clock">
        <span className="hud-clock-label">SIM TIME</span>
        <span className="hud-clock-value">
          {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
        </span>
        <span className="hud-clock-tick">t·{tickCount.toLocaleString()}</span>
      </div>
    );
  }

  function AvatarChip({ av, size = 'md' }) {
    return (
      <div className={`hud-avchip size-${size}`} style={{ background: `hsl(${av.hue} 65% 52%)` }}>
        <span>{av.tag}</span>
      </div>
    );
  }

  function AvatarCard({ av, compact = false }) {
    if (!av) return <div className="hud-empty">no avatar focused</div>;
    const aide = WE.AIDES[av.id];
    const sc = av.scenarioId ? WE.SCENARIOS.find(s => s.id === av.scenarioId) : null;
    const room = WE.ROOMS.find(r => r.id === av.room);
    return (
      <div className={`hud-avcard ${compact ? 'is-compact' : ''}`}>
        <div className="hud-avcard-head">
          <AvatarChip av={av} size="lg" />
          <div className="hud-avcard-id">
            <div className="hud-avcard-name">{av.name}</div>
            <div className="hud-avcard-trait">{av.trait}</div>
            <div className="hud-avcard-blurb">"{av.blurb}"</div>
          </div>
          <div className={`hud-state state-${av.state}`}>{av.state}</div>
        </div>
        <div className="hud-bars-grid">
          <StatBar label="Focus"          v={av.focus}   tone="info" />
          <StatBar label="Cognitive Load" v={av.cogLoad} tone="warn" />
          <StatBar label="Stress"         v={av.stress}  tone="bad"  />
          <StatBar label="Burnout"        v={av.burnout} tone="crit" danger={0.7} />
        </div>
        <div className="hud-meta-grid">
          <Meta label="Room"     value={room ? room.name : '—'} />
          <Meta label="Scenario" value={sc ? sc.name : 'idle'} />
          <Meta label="Aide"     value={aide ? aide.name : '—'} />
          <Meta label="Independence" value={Math.round(av.independence * 100) + '%'} />
          <Meta label="Interventions" value={av.interventions} />
          <Meta label="Successes" value={`${av.successes}/${av.successes + av.failures || '0'}`} />
        </div>
      </div>
    );
  }

  function Meta({ label, value }) {
    return (
      <div className="hud-meta">
        <div className="hud-meta-label">{label}</div>
        <div className="hud-meta-value">{value}</div>
      </div>
    );
  }

  function BeatTimeline({ av }) {
    if (!av || !av.scenarioId) return null;
    const sc = WE.SCENARIOS.find(s => s.id === av.scenarioId);
    if (!sc) return null;
    const pct = Math.min(100, (av.elapsed / av.expected) * 100);
    return (
      <div className="hud-timeline">
        <div className="hud-timeline-head">
          <span className="hud-timeline-name">{sc.name}</span>
          <span className="hud-timeline-time">{av.elapsed.toFixed(0)} / {av.expected} min</span>
        </div>
        <div className="hud-timeline-track">
          <div className="hud-timeline-fill" style={{ width: pct + '%' }} />
        </div>
      </div>
    );
  }

  function EventStream({ events, max = 30, mode = 'list' }) {
    return (
      <div className={`hud-stream mode-${mode}`}>
        <div className="hud-card-head">
          <span className="hud-card-title">EVENT STREAM</span>
          <span className="hud-card-sub">{events.length} events</span>
        </div>
        <div className="hud-stream-list">
          {events.slice(0, max).map((e, i) => (
            <div key={e.id} className={`hud-evt evt-${e.kind}`} style={{ opacity: 1 - i * 0.018 }}>
              <span className="evt-dot" style={{ background: `hsl(${e.avatarHue} 70% 60%)` }} />
              <span className="evt-kind">{e.kind.replace(/_/g, ' ').toLowerCase()}</span>
              <span className="evt-name">{e.avatarName}</span>
              <span className="evt-text">{e.text}</span>
            </div>
          ))}
          {events.length === 0 && <div className="hud-empty">waiting for tick…</div>}
        </div>
      </div>
    );
  }

  function AideLog({ interventions, max = 6 }) {
    return (
      <div className="hud-aidelog">
        <div className="hud-card-head">
          <span className="hud-card-title">AIDE COACHING LOG</span>
          <span className="hud-card-sub">{interventions.length} live</span>
        </div>
        <div className="hud-aidelog-list">
          {interventions.slice(0, max).map(i => (
            <div key={i.id} className="hud-aide-card">
              <div className="hud-aide-head">
                <span className="hud-aide-name">{i.aide}</span>
                <span className="hud-aide-arrow">→</span>
                <span className="hud-aide-target" style={{ color: `hsl(${i.avatarHue} 70% 65%)` }}>
                  {i.avatarName}
                </span>
              </div>
              <div className="hud-aide-strategy">"{i.strategy}"</div>
              <div className="hud-aide-meter">
                <div className="hud-aide-meter-fill" style={{ width: Math.round(i.effectiveness * 100) + '%' }} />
                <span>{Math.round(i.effectiveness * 100)}% effective</span>
              </div>
            </div>
          ))}
          {interventions.length === 0 && <div className="hud-empty">no interventions yet</div>}
        </div>
      </div>
    );
  }

  function ScenarioPicker({ avatar, onAssign, dysfunctionOn }) {
    if (!avatar) return null;
    return (
      <div className="hud-scenarios">
        <div className="hud-card-head">
          <span className="hud-card-title">SCENARIO LIBRARY</span>
          <span className="hud-card-sub">{WE.SCENARIOS.length} avail · dysfunction
            <strong className={dysfunctionOn ? 'on' : 'off'}> {dysfunctionOn ? 'ON' : 'OFF'}</strong>
          </span>
        </div>
        <div className="hud-scenarios-grid">
          {WE.SCENARIOS.map(sc => (
            <button key={sc.id} className={`hud-sc-cell cat-${sc.cat}`}
                    onClick={() => onAssign(avatar.id, sc.id)}>
              <span className="sc-cat">{sc.cat}</span>
              <span className="sc-name">{sc.name}</span>
              <span className="sc-meta">{sc.minutes}m · cog {Math.round(sc.cog * 10)} · av {Math.round(sc.aversive * 10)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function NpcRoster({ compact = false }) {
    return (
      <div className={`hud-npcs ${compact ? 'is-compact' : ''}`}>
        <div className="hud-card-head">
          <span className="hud-card-title">NPC ROSTER</span>
          <span className="hud-card-sub">{WE.NPCS.length} chars</span>
        </div>
        <div className="hud-npcs-list">
          {WE.NPCS.map(npc => (
            <div key={npc.id} className="hud-npc">
              <div className="hud-npc-portrait" style={{ background: `hsl(${npc.hue} 55% 55%)` }} />
              <div className="hud-npc-meta">
                <div className="hud-npc-name">{npc.name}</div>
                <div className="hud-npc-role">{npc.role} · {WE.ROOMS.find(r => r.id === npc.room)?.name}</div>
              </div>
              <div className={`hud-npc-bias ${npc.biased ? 'is-biased' : ''}`}>
                {npc.biased ? 'biased' : 'neutral'}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function FleetGrid({ avatars, selectedId, onSelect, cols = 2, compact = false }) {
    return (
      <div className={`hud-fleet cols-${cols} ${compact ? 'is-compact' : ''}`}>
        <div className="hud-card-head">
          <span className="hud-card-title">AVATAR FLEET · 19</span>
          <span className="hud-card-sub">{avatars.filter(a => a.scenarioId).length} in scenario</span>
        </div>
        <div className="hud-fleet-grid">
          {avatars.map(av => {
            const urgency = Math.max(av.stress, av.cogLoad, 1 - av.focus);
            const tone = urgency > 0.7 ? 'crit' : urgency > 0.5 ? 'warn' : 'ok';
            return (
              <button key={av.id}
                      className={`hud-fleet-cell tone-${tone} ${selectedId === av.id ? 'is-sel' : ''} ${av.scenarioId ? 'is-active' : ''}`}
                      onClick={() => onSelect(av.id)}>
                <AvatarChip av={av} size="sm" />
                <div className="hud-fleet-name">{av.name}</div>
                <div className="hud-fleet-trait">{av.trait}</div>
                {!compact && (
                  <div className="hud-fleet-spark">
                    <span className="spk fc" style={{ height: (av.focus * 100) + '%' }} />
                    <span className="spk lo" style={{ height: (av.cogLoad * 100) + '%' }} />
                    <span className="spk st" style={{ height: (av.stress * 100) + '%' }} />
                    <span className="spk bu" style={{ height: (av.burnout * 100) + '%' }} />
                  </div>
                )}
                {!compact && <div className="hud-fleet-status">{av.state}</div>}
                <div className="hud-fleet-fusion"><div style={{ width: (av.fusionReady * 100) + '%' }} /></div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function ProgressTriple({ av }) {
    if (!av) return null;
    const total = av.successes + av.failures;
    const winRate = total > 0 ? av.successes / total : av.successRate;
    return (
      <div className="hud-progress">
        <div className="hud-card-head">
          <span className="hud-card-title">LEARNING CURVE · {av.name}</span>
          <span className="hud-card-sub">{total} runs</span>
        </div>
        <div className="hud-progress-cells">
          <BigStat label="Independence" v={av.independence} tone="info" />
          <BigStat label="Success Rate" v={winRate} tone="good" />
          <BigStat label="Fusion Ready" v={av.fusionReady} tone="accent" />
        </div>
        <div className="hud-fusion">
          <div className="hud-fusion-label">Avatar → Advocate fusion</div>
          <div className="hud-fusion-track">
            <div className="hud-fusion-fill" style={{ width: (av.fusionReady * 100) + '%' }} />
            <div className="hud-fusion-marker" style={{ left: '60%' }} title="candidate" />
            <div className="hud-fusion-marker" style={{ left: '85%' }} title="fusion" />
          </div>
          <div className="hud-fusion-ticks"><span>baseline</span><span>candidate</span><span>fusion</span></div>
        </div>
      </div>
    );
  }

  function BigStat({ label, v, tone = 'info' }) {
    return (
      <div className={`hud-bigstat tone-${tone}`}>
        <div className="hud-bigstat-num">{Math.round(v * 100)}<small>%</small></div>
        <div className="hud-bigstat-label">{label}</div>
        <div className="hud-bigstat-bar"><div style={{ width: (v * 100) + '%' }} /></div>
      </div>
    );
  }

  return {
    AvatarChip, AvatarCard, StatBar, EventStream, AideLog, ScenarioPicker,
    NpcRoster, FleetGrid, ProgressTriple, BeatTimeline, Clock, Meta, BigStat,
  };
})();
