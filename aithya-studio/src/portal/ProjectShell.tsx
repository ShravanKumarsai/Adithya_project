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

type Project = { id: string; name: string; hackathon_name?: string; submission_deadline?: string };
type Status = { usage?: string; sources?: string; unread?: number };
type Props = { project: Project; sheet: string; available: string[]; open: (sheet: string) => void };

function ProjectShell({ project, sheet, available, open, status }: Props & { status: Status }) {
  const entries = Object.entries(sections);
  const area = entries.find(([, views]) => (views as readonly string[]).includes(sheet));
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
          <p>{[project.hackathon_name, deadlineLabel(project.submission_deadline)].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="portal-tools">
          <details>
            <summary className="button subtle">{status.usage || 'AI usage'}</summary>
            <p>Gemini project allowance</p>
            <div className="shared-actions">
              {available.includes('AI credits') && link('AI credits', 'Provider credits')}
              {available.includes('Settings') && link('Settings', 'Connection settings')}
            </div>
          </details>
        </div>
      </header>
      <nav className="portal-tabs" aria-label="Project areas">
        {entries.map(([name, views]) => link(views[0], name + (name === 'Team' && status.unread ? ' (' + status.unread + ')' : ''), area?.[0] === name))}
      </nav>
      {area && (
        <nav className="portal-tools portal-local-nav" aria-label={area[0] + ' tools'}>
          {area[1].filter(view => available.includes(view)).slice(0, area[0] === 'Work' ? 2 : area[0] === 'Today' ? 1 : 3)
            .map(view => link(view, labels[view] || view))}
          {area[1].filter(view => available.includes(view)).length > (area[0] === 'Work' ? 2 : area[0] === 'Today' ? 1 : 3) && (
            <details>
              <summary className="button subtle">More</summary>
              <div className="shared-actions">
                {area[1].filter(view => available.includes(view)).slice(area[0] === 'Work' ? 2 : area[0] === 'Today' ? 1 : 3)
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
