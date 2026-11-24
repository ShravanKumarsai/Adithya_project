import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

type Project = {
  id:string;
  name:string;
  hackathon_name?:string;
  theme?:string;
  submission_deadline?:string;
  archived_at?:string;
};

type Draft = {
  id:string;
  content:{project?:{name?:string}};
  updated_at?:string;
};

type Props = {
  projects: Project[];
  drafts: Draft[];
  open: (project:Project) => void;
  create: (fromRules?:boolean) => void;
  resume: (draft:Draft) => void;
};

function ProjectDirectory({projects,drafts,open,create,resume}:Props) {
  const active = projects.filter(project => !project.archived_at);
  const archived = projects.filter(project => project.archived_at);
  const rows = (list:Project[]) => list.map(project => (
    <article className="project-entry" key={project.id}>
      <div>
        <h2>{project.name}</h2>
        <p>{[project.hackathon_name,project.theme,project.submission_deadline && 'Due ' + project.submission_deadline].filter(Boolean).join(' · ')}</p>
      </div>
      <button type="button" className="button subtle" onClick={()=>open(project)}>Open project</button>
    </article>
  ));
  return (
    <>
      <header className="shared-header">
        <div><h1>Shared projects</h1><p className="shared-muted">Your team work, drafts, and next steps.</p></div>
        <div className="shared-actions">
          <button type="button" className="button primary" onClick={()=>create()}>Create project</button>
          <button type="button" className="button subtle" id="new-project-from-rules" onClick={()=>create(true)}>Create from rulebook</button>
        </div>
      </header>
      {drafts.length > 0 && (
        <section>
          <h2>Continue setup</h2>
          {drafts.map(draft => (
            <div className="project-entry" key={draft.id}>
              <div>
                <b>{draft.content.project?.name || 'Untitled draft'}</b>
                <p>{draft.updated_at ? 'Saved ' + new Date(draft.updated_at).toLocaleString() : 'In this tab'}</p>
              </div>
              <button type="button" className="button subtle" onClick={()=>resume(draft)}>Resume</button>
            </div>
          ))}
        </section>
      )}
      <section className="project-list">
        {active.length ? rows(active) : <p className="shared-muted">Create a project or accept an invitation to get started.</p>}
      </section>
      {archived.length > 0 && <details><summary>Archived projects</summary>{rows(archived)}</details>}
    </>
  );
}

export function mountProjectDirectory(host:HTMLElement, props:Props) {
  const root = createRoot(host);
  flushSync(() => root.render(<ProjectDirectory {...props} />));
  return () => root.unmount();
}
