// variations.jsx — Four visual treatments of the same live World Engine.
// Each variation reads the same sim (passed via props) and arranges the
// shared world-view + HUD widgets with its own theme + layout.
// Exports (to window): Variations = { Mission, Habitat, Bridge, Pixel }.

window.Variations = (function () {
  const WE = window.WE_DATA;
  const Hud = window.Hud;
  const WorldView = window.WorldView;

  // -------------------------------------------------------- A · Avatar POV
  // Top-close 3rd-person camera on the focused Avatar. Their room, their life.
  // Aide appears as a coaching presence nearby; HUD is felt-state, not clinical.
  function Mission({ sim, selected, onSelect, onAssign, onCoach }) {
    const sc = selected?.scenarioId ? WE.SCENARIOS.find(s => s.id === selected.scenarioId) : null;
    const cameraRoom = sc?.room || selected?.room || 'office';
    // Show the Aide for THIS avatar only; bubble dialog if their latest intervention is fresh.
    const latestForMe = sim.interventions.find(i => i.avatarId === selected?.id);
    const isFreshCoach = latestForMe && (Date.now() - latestForMe.t) < 7000;
    const coachingProp = isFreshCoach
      ? { avatarId: latestForMe.avatarId, strategy: latestForMe.strategy }
      : null;
    const recentForMe = sim.events.filter(e => e.avatarId === selected?.id).slice(0, 5);
    const stressFrac = selected?.stress ?? 0;
    const vignetteOpacity = Math.min(0.55, stressFrac * 0.55);

    return (
      <div className="var var-mission var-apov">
        <div className="apov-topbar">
          <div className="apov-brand">
            {selected && <Hud.AvatarChip av={selected} size="md" />}
            <div className="apov-brand-text">
              <span className="apov-brand-name">{selected?.name || '—'}</span>
              <span className="apov-brand-sub">A · Avatar POV — {selected?.trait}</span>
            </div>
          </div>
          <div className="apov-beat">
            <Hud.BeatTimeline av={selected} />
          </div>
          <Hud.Clock simTime={sim.simTime} tickCount={sim.tickCount} />
        </div>

        <div className="apov-stage">
          <WorldView avatars={sim.avatars} selectedId={selected?.id}
                     theme="mission" sprite="rounded"
                     camera={{ room: cameraRoom, padX: 1, padY: 1 }}
                     aides={selected ? [selected.id] : []}
                     coaching={coachingProp} />

          {/* stress-driven edge vignette */}
          <div className="apov-vignette" style={{ opacity: vignetteOpacity }} />

          {/* identity card, lower-left */}
          <div className="apov-id-card">
            <div className="apov-id-head">
              {selected && <Hud.AvatarChip av={selected} size="lg" />}
              <div>
                <div className="apov-id-name">{selected?.name}</div>
                <div className="apov-id-trait">{selected?.trait}</div>
              </div>
            </div>
            <div className="apov-id-blurb">"{selected?.blurb}"</div>
            <div className="apov-id-feel">feels <em>{feelLabel(selected)}</em> in <em>{WE.ROOMS.find(r => r.id === cameraRoom)?.name}</em></div>
          </div>

          {/* scenario context, top-left */}
          {sc && (
            <div className="apov-context">
              <div className="apov-context-label">CURRENT SCENARIO</div>
              <div className="apov-context-name">{sc.name}</div>
              <div className="apov-context-desc">{sc.desc}</div>
              <div className="apov-context-meta">
                <span>{sc.cat}</span><span>·</span>
                <span>{Math.round(selected.elapsed)}/{selected.expected}m</span><span>·</span>
                <span>cog {Math.round(sc.cog*10)}/10</span>
              </div>
            </div>
          )}

          {/* aide presence card, top-right — always visible, shifts when coaching */}
          <div className={`apov-aide-card ${isFreshCoach ? 'is-active' : ''}`}>
            <div className="apov-aide-icon">✚</div>
            <div className="apov-aide-body">
              <div className="apov-aide-label">{isFreshCoach ? 'COACHING NOW' : 'AIDE NEARBY'}</div>
              <div className="apov-aide-name">{WE.AIDES[selected?.id]?.name}</div>
              {isFreshCoach
                ? <div className="apov-aide-strategy">"{latestForMe.strategy}"</div>
                : <div className="apov-aide-style">{WE.AIDES[selected?.id]?.style}</div>}
            </div>
          </div>

          {/* internal moments stream — only events for this Avatar */}
          <div className="apov-moments">
            <div className="apov-moments-label">INTERNAL FEED</div>
            {recentForMe.length === 0 && <div className="apov-moment is-empty">…quiet for now…</div>}
            {recentForMe.map(e => (
              <div key={e.id} className={`apov-moment evt-${e.kind}`}>
                <span className="apov-moment-dot" />
                <span className="apov-moment-text">{e.text}</span>
              </div>
            ))}
          </div>

          {/* needs strip at bottom — game HUD style */}
          <div className="apov-needs">
            <ApovNeed label="FOCUS"   v={selected?.focus ?? 0}   tone="info"  />
            <ApovNeed label="LOAD"    v={selected?.cogLoad ?? 0} tone="warn"  invert />
            <ApovNeed label="STRESS"  v={selected?.stress ?? 0}  tone="bad"   invert />
            <ApovNeed label="BURNOUT" v={selected?.burnout ?? 0} tone="crit"  invert />
            <div className="apov-needs-sep" />
            <ApovStat label="INDEP." v={selected?.independence ?? 0} suffix="%" />
            <ApovStat label="FUSION" v={selected?.fusionReady ?? 0}  suffix="%" />
            <ApovStat label="RUNS"   v={(selected?.successes ?? 0) + (selected?.failures ?? 0)} flat />
          </div>
        </div>
      </div>
    );
  }

  function ApovNeed({ label, v, tone = 'info', invert = false }) {
    const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
    return (
      <div className={`apov-need tone-${tone} ${invert ? 'is-inv' : ''}`}>
        <div className="apov-need-label">{label}</div>
        <div className="apov-need-track">
          <div className="apov-need-fill" style={{ width: pct + '%' }} />
        </div>
        <div className="apov-need-pct">{pct}</div>
      </div>
    );
  }

  function ApovStat({ label, v, suffix = '', flat = false }) {
    const val = flat ? Math.round(v) : Math.round(v * 100);
    return (
      <div className="apov-statpill">
        <span className="apov-statpill-l">{label}</span>
        <span className="apov-statpill-v">{val}<small>{suffix}</small></span>
      </div>
    );
  }

  function feelLabel(av) {
    if (!av) return 'absent';
    if (av.stress > 0.75) return 'overwhelmed';
    if (av.stress > 0.55) return 'frayed';
    if (av.stress > 0.35) return 'tense';
    if (av.cogLoad > 0.7) return 'overloaded';
    if (av.focus > 0.75)  return 'locked in';
    if (av.focus > 0.55)  return 'focused';
    return 'okay';
  }

  // -------------------------------------------------------- B · Habitat
  // Warm cozy Sims 4 feel. World takes the spotlight; HUD is a narrative side rail.
  function Habitat({ sim, selected, onSelect, onAssign }) {
    const aide = selected ? WE.AIDES[selected.id] : null;
    const sc = selected?.scenarioId ? WE.SCENARIOS.find(s => s.id === selected.scenarioId) : null;
    const latest = sim.events.slice(0, 6);
    return (
      <div className="var var-habitat">
        <div className="var-topbar">
          <div className="var-brand">
            <div className="var-mark hab-mark">◆</div>
            <div className="var-brand-text">
              <span className="var-brand-name">World Engine</span>
              <span className="var-brand-sub">B · Habitat — gentle observation</span>
            </div>
          </div>
          <div className="hab-day">
            <span className="hab-day-l">Day</span>
            <span className="hab-day-n">04</span>
            <span className="hab-day-c">{(() => {
              const hh = Math.floor((sim.simTime + 9 * 60) / 60) % 24;
              return hh < 12 ? 'morning' : hh < 17 ? 'afternoon' : 'evening';
            })()}</span>
          </div>
        </div>
        <div className="var-grid var-grid-habitat">
          <main className="var-stage hab-stage">
            <WorldView avatars={sim.avatars} selectedId={selected?.id}
                       onSelect={onSelect} theme="habitat" sprite="rounded" />
            <div className="hab-card-overlay">
              <div className="hab-character">
                {selected && <Hud.AvatarChip av={selected} size="lg" />}
                <div>
                  <div className="hab-char-name">{selected?.name}</div>
                  <div className="hab-char-mood">{selected?.state} · feels {moodLabel(selected)}</div>
                </div>
              </div>
              <div className="hab-bars">
                <Hud.StatBar label="focus"  v={selected?.focus  ?? 0} tone="info" />
                <Hud.StatBar label="stress" v={selected?.stress ?? 0} tone="bad"  />
              </div>
            </div>
          </main>
          <aside className="var-right hab-right">
            <div className="hab-narrative">
              <h3>Right now</h3>
              <p>
                <strong>{selected?.name}</strong> is in{' '}
                <em>{WE.ROOMS.find(r => r.id === selected?.room)?.name || 'transit'}</em>
                {sc ? <> working on <em>{sc.name}</em>.</> : <> with nothing assigned.</>}
              </p>
              {aide && <p><strong>{aide.name}</strong> is nearby — <em>{aide.style}</em>.</p>}
              {selected?.stress > 0.6 && <p className="hab-warn">Stress is climbing. {aide?.name} may step in.</p>}
            </div>
            <div className="hab-events">
              <h3>What just happened</h3>
              <ul>
                {latest.map(e => (
                  <li key={e.id}>
                    <span className="hab-bullet" style={{ background: `hsl(${e.avatarHue} 60% 60%)` }} />
                    <span className="hab-evt-name">{e.avatarName}</span>
                    <span className="hab-evt-text">{e.text.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hab-quick">
              <h3>Send to scenario</h3>
              <div className="hab-quick-grid">
                {WE.SCENARIOS.slice(0, 6).map(sc => (
                  <button key={sc.id} className={`hab-quick-cell cat-${sc.cat}`}
                          onClick={() => selected && onAssign(selected.id, sc.id)}>
                    <span>{sc.name}</span>
                    <small>{sc.cat} · {sc.minutes}m</small>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  function moodLabel(av) {
    if (!av) return 'unknown';
    if (av.stress > 0.7) return 'frayed';
    if (av.stress > 0.5) return 'tense';
    if (av.cogLoad > 0.7) return 'loaded';
    if (av.focus > 0.7)  return 'focused';
    return 'okay';
  }

  // -------------------------------------------------------- C · Aide POV
  // Observing the Aide doing their job. Aide is visible in the world beside the
  // Avatar; the chrome wraps the Aide's tools: queue, strategy library, log.
  function Bridge({ sim, selected, onSelect, onAssign, onCoach }) {
    const aide = selected ? WE.AIDES[selected.id] : null;
    const sc = selected?.scenarioId ? WE.SCENARIOS.find(s => s.id === selected.scenarioId) : null;
    const cameraRoom = sc?.room || selected?.room || 'office';
    const latestForMe = sim.interventions.find(i => i.avatarId === selected?.id);
    const isFreshCoach = latestForMe && (Date.now() - latestForMe.t) < 7000;
    const coachingProp = isFreshCoach
      ? { avatarId: latestForMe.avatarId, strategy: latestForMe.strategy }
      : null;

    // Queue — avatars sorted by urgency descending.
    const queue = sim.avatars
      .map(av => ({ av, urgency: Math.max(av.stress, av.cogLoad, 1 - av.focus) }))
      .sort((a, b) => b.urgency - a.urgency);
    const critCount = queue.filter(q => q.urgency > 0.7).length;
    const warnCount = queue.filter(q => q.urgency > 0.5 && q.urgency <= 0.7).length;

    // Strategies available for the focused Avatar.
    const strategies = selected ? (WE.STRATEGIES[selected.flavor] || WE.STRATEGIES.attention) : [];

    return (
      <div className="var var-bridge var-aidepov">
        <div className="aidepov-topbar">
          <div className="aidepov-brand">
            <div className="aidepov-mark">✚</div>
            <div className="aidepov-brand-text">
              <span className="aidepov-brand-name">{aide?.name || 'On call'}</span>
              <span className="aidepov-brand-sub">C · Aide POV — {aide?.style}</span>
            </div>
          </div>
          <div className="aidepov-stats">
            <AidePovStat label="SHIFT"      value={fmtShift(sim.simTime)} />
            <AidePovStat label="INTERV."    value={sim.interventions.length} />
            <AidePovStat label="WARN"       value={warnCount} tone="warn" />
            <AidePovStat label="CRITICAL"   value={critCount} tone="crit" />
          </div>
          <Hud.Clock simTime={sim.simTime} tickCount={sim.tickCount} />
        </div>

        <div className="aidepov-grid">
          <aside className="aidepov-queue">
            <div className="aidepov-card-head">
              <span>QUEUE</span><small>who needs you</small>
            </div>
            <div className="aidepov-queue-list">
              {queue.slice(0, 19).map(({ av, urgency }) => {
                const tone = urgency > 0.7 ? 'crit' : urgency > 0.5 ? 'warn' : 'ok';
                return (
                  <button key={av.id}
                          className={`aidepov-queue-cell tone-${tone} ${selected?.id === av.id ? 'is-sel' : ''}`}
                          onClick={() => onSelect(av.id)}>
                    <Hud.AvatarChip av={av} size="sm" />
                    <div className="aqc-meta">
                      <div className="aqc-name">{av.name}</div>
                      <div className="aqc-trait">{av.trait}</div>
                    </div>
                    <div className="aqc-urgency">
                      <div className="aqc-urgency-bar">
                        <div className="aqc-urgency-fill" style={{ width: Math.round(urgency * 100) + '%' }} />
                      </div>
                      <span>{Math.round(urgency * 100)}<small>%</small></span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="aidepov-stage var-stage">
            <WorldView avatars={sim.avatars} selectedId={selected?.id} onSelect={onSelect}
                       theme="bridge" sprite="rounded"
                       camera={{ room: cameraRoom, padX: 1.2, padY: 1.2 }}
                       aides={selected ? [selected.id] : []}
                       coaching={coachingProp} />
            <div className="aidepov-stage-meta">
              <span className="legend">OBSERVING</span>
              <span className="who">{aide?.name} <em>with</em> {selected?.name}</span>
              <span className="scene">{sc ? sc.name : 'idle, no scenario'} · {WE.ROOMS.find(r => r.id === cameraRoom)?.name}</span>
            </div>
            <div className="aidepov-stage-pulse">
              <PulseDot v={selected?.stress ?? 0} label="stress" />
              <PulseDot v={selected?.cogLoad ?? 0} label="load" />
              <PulseDot v={1 - (selected?.focus ?? 0)} label="drift" />
            </div>
          </main>

          <aside className="aidepov-tools">
            <div className="aidepov-card-head"><span>SUBJECT</span><small>{selected?.name}</small></div>
            <Hud.AvatarCard av={selected} compact />
            <div className="aidepov-card-head"><span>DEPLOY STRATEGY</span><small>{aide?.focus}</small></div>
            <div className="aidepov-strats">
              {strategies.map(s => (
                <button key={s} className="aidepov-strat"
                        disabled={!selected}
                        onClick={() => selected && onCoach && onCoach(selected.id, s)}>
                  <span className="strat-arrow">→</span>
                  <span className="strat-name">{s}</span>
                </button>
              ))}
            </div>
          </aside>

          <footer className="aidepov-log">
            <div className="aidepov-card-head"><span>INTERVENTION LOG</span><small>{sim.interventions.length} sessions</small></div>
            <div className="aidepov-log-list">
              {sim.interventions.slice(0, 7).map(i => (
                <div key={i.id} className="aidepov-log-row">
                  <span className="log-aide">{i.aide}</span>
                  <span className="log-arrow">→</span>
                  <span className="log-target" style={{ color: `hsl(${i.avatarHue} 70% 65%)` }}>{i.avatarName}</span>
                  <span className="log-strat">“{i.strategy}”</span>
                  <span className="log-meter">
                    <span className="log-meter-fill" style={{ width: Math.round(i.effectiveness * 100) + '%' }} />
                  </span>
                  <span className="log-eff">{Math.round(i.effectiveness * 100)}%</span>
                </div>
              ))}
              {sim.interventions.length === 0 && (
                <div className="aidepov-empty">no interventions yet — watch for spikes in the queue</div>
              )}
            </div>
          </footer>
        </div>
      </div>
    );
  }

  function AidePovStat({ label, value, tone = 'default' }) {
    return (
      <div className={`aidepov-stat tone-${tone}`}>
        <div className="aidepov-stat-label">{label}</div>
        <div className="aidepov-stat-value">{value}</div>
      </div>
    );
  }

  function PulseDot({ v, label }) {
    const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
    const tone = pct > 70 ? 'crit' : pct > 45 ? 'warn' : 'ok';
    return (
      <div className={`pulsedot tone-${tone}`}>
        <span className="pulsedot-dot" />
        <span className="pulsedot-label">{label}</span>
        <span className="pulsedot-val">{pct}</span>
      </div>
    );
  }

  function fmtShift(simTime) {
    const h = Math.floor(simTime / 60);
    const m = Math.floor(simTime % 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  // -------------------------------------------------------- D · Pixel Town
  // Retro RPG. Pixel sprites, NES palette, dialog box for Aide coaching,
  // action menu for scenarios, simple stat row.
  function Pixel({ sim, selected, onSelect, onAssign }) {
    const aide = selected ? WE.AIDES[selected.id] : null;
    const latestIntervention = sim.interventions[0];
    const sc = selected?.scenarioId ? WE.SCENARIOS.find(s => s.id === selected.scenarioId) : null;
    return (
      <div className="var var-pixel">
        <div className="pix-topbar">
          <span className="pix-title">★ WORLD ENGINE ★</span>
          <span className="pix-subtitle">D · NeuroQuest</span>
          <span className="pix-coin">DAY 04</span>
        </div>
        <div className="var-grid var-grid-pixel">
          <main className="var-stage pix-stage">
            <WorldView avatars={sim.avatars} selectedId={selected?.id}
                       onSelect={onSelect} theme="pixel" sprite="pixel" />
            <div className="pix-corner pix-tl">
              <PixStat label="HP" v={1 - (selected?.stress ?? 0)} max={20} />
              <PixStat label="MP" v={selected?.focus ?? 0}        max={20} />
              <PixStat label="LV" v={(selected?.independence ?? 0) * 99 / 100} max={99} flat />
            </div>
            <div className="pix-corner pix-tr">
              <div className="pix-mini-stats">
                <div>EV·{sim.events.length}</div>
                <div>IV·{sim.interventions.length}</div>
                <div>T·{sim.tickCount}</div>
              </div>
            </div>
          </main>
          <div className="pix-dialog">
            {latestIntervention ? (
              <>
                <div className="pix-dialog-name">{latestIntervention.aide}:</div>
                <div className="pix-dialog-text">
                  {selected?.name}, try <em>"{latestIntervention.strategy}"</em>.
                  {latestIntervention.effectiveness > 0.6
                    ? ' It should help bring stress down.'
                    : ' We may need to try a different approach.'}
                </div>
                <div className="pix-dialog-meter">
                  <span>EFFECT</span>
                  <div className="pix-meter-track"><div style={{ width: Math.round(latestIntervention.effectiveness * 100) + '%' }} /></div>
                </div>
              </>
            ) : (
              <>
                <div className="pix-dialog-name">{aide?.name || 'Aide'}:</div>
                <div className="pix-dialog-text">
                  Watching {selected?.name || 'the party'}. {sc ? `Currently: ${sc.name}.` : 'No active quest.'}
                </div>
              </>
            )}
            <div className="pix-dialog-blink">▼</div>
          </div>
          <aside className="pix-side">
            <div className="pix-panel">
              <div className="pix-panel-title">PARTY</div>
              <div className="pix-party">
                {sim.avatars.slice(0, 8).map(av => (
                  <button key={av.id}
                          className={`pix-party-cell ${selected?.id === av.id ? 'is-sel' : ''}`}
                          onClick={() => onSelect(av.id)}>
                    <div className="pix-portrait" style={{ background: `hsl(${av.hue} 65% 50%)` }}>
                      <span>{av.tag}</span>
                    </div>
                    <div className="pix-party-info">
                      <div className="pix-party-name">{av.name}</div>
                      <div className="pix-party-meta">{av.state}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="pix-panel">
              <div className="pix-panel-title">QUEST</div>
              <div className="pix-quests">
                {WE.SCENARIOS.slice(0, 6).map(sc => (
                  <button key={sc.id} className="pix-quest" onClick={() => selected && onAssign(selected.id, sc.id)}>
                    ▶ {sc.name.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </aside>
          <div className="pix-actionbar">
            <span className={`pix-action ${sim.running ? '' : 'is-off'}`}>● TICK</span>
            <span className="pix-action">EV·{sim.events.length}</span>
            <span className="pix-action">FUSION·{Math.round((selected?.fusionReady ?? 0) * 100)}%</span>
            <span className="pix-action pix-action-end">PRESS A TO CONTINUE</span>
          </div>
        </div>
      </div>
    );
  }

  function PixStat({ label, v, max = 20, flat = false }) {
    const cells = Math.round(Math.min(1, v) * max);
    return (
      <div className="pix-stat">
        <span className="pix-stat-label">{label}</span>
        {flat
          ? <span className="pix-stat-flat">{cells}</span>
          : <span className="pix-stat-cells">
              {Array.from({ length: max }, (_, i) => (
                <span key={i} className={`pix-cell ${i < cells ? 'on' : ''}`} />
              ))}
            </span>}
      </div>
    );
  }

  return { Mission, Habitat, Bridge, Pixel };
})();
