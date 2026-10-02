// World Engine HUD — HTML overlay showing tick count and world status.

import type { WorldState } from './simulation';

export class HUD {
  private hudTop: HTMLElement | null;
  private pairInfo: HTMLElement | null;
  private eventsDiv: HTMLElement | null;

  constructor() {
    this.hudTop = document.getElementById('hud-top');
    this.pairInfo = document.getElementById('pair-info');
    this.eventsDiv = document.getElementById('events');
  }

  render(world: WorldState): void {
    this.renderTop(world);
    this.renderPairInfo(world);
    this.renderEvents(world);
  }

  private renderTop(world: WorldState): void {
    if (!this.hudTop) return;
    this.hudTop.innerHTML = '';

    const tickChip = document.createElement('span');
    tickChip.className = 'hud-chip';
    tickChip.textContent = `Tick: ${world.tickCount}`;
    this.hudTop.appendChild(tickChip);

    const timeChip = document.createElement('span');
    timeChip.className = 'hud-chip';
    const hours = Math.floor(world.simTime / 60) % 24;
    const mins = Math.floor(world.simTime) % 60;
    timeChip.textContent = `Time: ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    this.hudTop.appendChild(timeChip);

    const simsChip = document.createElement('span');
    simsChip.className = 'hud-chip';
    simsChip.textContent = `Avatars: ${world.avatars.length}`;
    this.hudTop.appendChild(simsChip);
  }

  private renderPairInfo(world: WorldState): void {
    if (!this.pairInfo) return;
    this.pairInfo.innerHTML = '';
    const msg = document.createElement('div');
    msg.textContent = `${world.avatars.length} avatars · ${world.events.length} events`;
    msg.style.opacity = '0.7';
    msg.style.fontSize = '11px';
    this.pairInfo.appendChild(msg);
  }

  private renderEvents(world: WorldState): void {
    if (!this.eventsDiv) return;
    this.eventsDiv.innerHTML = '';

    const header = document.createElement('div');
    header.style.fontWeight = 'bold';
    header.style.marginBottom = '6px';
    header.textContent = 'Recent Events';
    this.eventsDiv.appendChild(header);

    const events = world.events.slice(0, 8);
    for (const evt of events) {
      const row = document.createElement('div');
      row.className = 'event-row';
      row.textContent = evt.text;
      this.eventsDiv.appendChild(row);
    }
  }
}
