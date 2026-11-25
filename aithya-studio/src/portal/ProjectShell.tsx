import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { MouseEvent } from 'react';

import { deadlineLabel, sections } from "./routes.js";

const labels: Record<string, string> = {
  'Project setup': 'Rulebook and requirements',
  'Ship check': 'Readiness and evidence',
  'Team': 'Members',
  'AI plan': 'Plan',
};

const visibleTools: Record<string, number> = {Today:3, Work:3, Team:3, Rules:2, Submit:3};

type Project = { id: string; name: string; hackathon_name?: string; submission_deadline?: string };
type Status = { usage?: string; usageReset?: string; sources?: string; unread?: number; needsGeminiKey?: boolean };
type Props = { project: Project; sheet: string; available: string[]; open: (sheet: string) => void; addTeamKey?: () => void };

function ProjectShell({ project, sheet, available, open, addTeamKey, status }: Props & { status: Status }) {
  const entries = Object.entries(sections);
  const area = entries.find(([, views]) => (views as readonly string[]).includes(sheet));
  const tools = area?.[1].filter(view => available.includes(view) && !(area[0] === 'Work' && view === 'AI mentor')) || [];
  const direct = area ? visibleTools[area[0]] : 0;
  const select = (event: MouseEvent<HTMLAnchorElement>, next: string) => {
    if (event.button || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    open(next);
    document.getElementById('shared-content')?.focus();
  };
  const link = (next: string, label: string, active = next === sheet) => (
    <a key={label} href={'/shared?' + new URLSearchParams({ project: project.id, sheet: next })}
      aria-current={active ? 'page' : undefined} onClick={event => select(event, next)}>{label}</a>
  );

  return (
    <div className="portal-shell">
      <header className="portal-head">
        <div>
          <h1>{project.name}</h1>
          {project.hackathon_name && <p>{project.hackathon_name}</p>}
        </div>
        <div className="portal-head-controls">
          <p className="portal-header-deadline">{deadlineLabel(project.submission_deadline)}</p>
          {status.needsGeminiKey && addTeamKey && (
            <button className="button subtle" type="button" onClick={addTeamKey}>Gemini · Add team key</button>
          )}
          <details className="portal-usage">
            <summary className="button subtle">{status.needsGeminiKey && addTeamKey ? 'AI usage' : status.usage || 'AI usage'}</summary>
            <p>{status.needsGeminiKey ? 'The project lead manages the team Gemini key.' :
              'Gemini studio requests' + (status.usageReset ? ' · Resets ' + status.usageReset : '')}</p>
            <div className="shared-actions">
              {available.includes('AI credits') && link('AI credits', 'Provider credits')}
              {available.includes('Settings') && link('Settings', 'Connection settings')}
            </div>
          </details>
        </div>
      </header>
      <nav className="portal-tabs" aria-label="Project areas">
        {entries.map(([name, views]) => link(views.find(view=>available.includes(view)) || views[0],
          name + (name === 'Team' && status.unread ? ' (' + status.unread + ')' : ''), area?.[0] === name))}
      </nav>
      {area && (
        <nav className="portal-tools portal-local-nav" aria-label={area[0] + ' tools'}>
          {tools.slice(0,direct)
            .map(view => link(view, labels[view] || view))}
          {tools.length > direct && (
            <details>
              <summary className="button subtle">More</summary>
              <div className="shared-actions">
                {tools.slice(direct)
                  .map(view => link(view, labels[view] || view))}
              </div>
            </details>
          )}
          {area[0] === 'Work' && link('AI mentor', 'Ask AI')}
        </nav>
      )}
      {status.sources && (area?.[0] === 'Work' || area?.[0] === 'Submit') && (
        <p className="portal-source-status" aria-live="polite">{status.sources}</p>
      )}
    </div>
  );
}

export function mountProjectShell(host: HTMLElement, props: Props) {
  const root = createRoot(host);
  let status: Status = {};
  const render = () => flushSync(() => root.render(<ProjectShell {...props} status={status} />));
  render();
  return {
    update(next: Status) { status = { ...status, ...next }; render(); },
    dispose() { root.unmount(); },
  };
}
