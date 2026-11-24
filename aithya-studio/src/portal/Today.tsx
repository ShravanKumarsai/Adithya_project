import { useEffect, useState } from "react";
import {supabase as db} from "../lib/supabase.js";
import { createRoot } from 'react-dom/client';
import { deadlineLabel } from './routes.js';

type Task = { id:string; owner_id:string | null; title:string; status:string; due_date:string | null; blocked_by:string | null };
type Post = { id:string; author_id:string | null; body:string; created_at:string; bulletin_type:string };
type Props = {
  project: { id:string; submission_deadline?:string };
  viewer:string;
  tasks:Task[];
  posts:Post[];
  week:Record<string,number>;
  open:(view:string)=>void;
  edit:(task:Task)=>void;
};

function Today({project, viewer, tasks, posts, week, open, edit}:Props) {
  const [recent, setRecent] = useState(posts);
  useEffect(() => {
    const channel = db.channel("portal-today-" + project.id + "-" + crypto.randomUUID())
      .on("postgres_changes", {event:"INSERT",schema:"public",table:"project_messages",filter:"project_id=eq." + project.id}, event => {
        const row = event.new as Post;
        if (row.bulletin_type)
          setRecent(current => [row, ...current.filter(post=>post.id !== row.id)].slice(0,12));
      }).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [project.id]);
  const done = new Set(tasks.filter(task=>task.status === 'done').map(task=>task.id));
  const mine = tasks.filter(task=>task.owner_id === viewer && task.status !== 'done')
    .sort((first, second)=>(first.due_date || '9999').localeCompare(second.due_date || '9999'));
  const next = mine.find(task=>!task.blocked_by || done.has(task.blocked_by));
  const read = sessionStorage.getItem('drafdeck.bulletin.' + viewer + '.' + project.id) || '';
  const newPosts = recent.filter(post=>post.created_at > read && post.author_id !== viewer);
  const digest = ['decision','blocker','announcement'].flatMap(type => {
    const count = week[type];
    return count ? [count + ' ' + type + (count === 1 ? '' : 's')] : [];
  });
  return (
    <section aria-labelledby="today-title">
      <header className="shared-header">
        <div><h2 id="today-title">Today</h2><p className="portal-deadline">{deadlineLabel(project.submission_deadline)}</p></div>
        <button type="button" className="button primary" onClick={()=>open('Board')}>Open work board</button>
      </header>
      <section className="bp-panel">
        <h3>Next action</h3>
        {next ? <p><button type="button" className="button subtle" onClick={()=>edit(next)}>{next.title}</button></p> :
          <p>{mine.length ? 'Ask the team about the tasks blocking your work.' : 'Check upcoming work with your team.'}</p>}
        {next && <small>Source · Your earliest unblocked assignment</small>}
      </section>
      <section className="bp-panel">
        <h3>My tasks</h3>
        {mine.length ? <ul>{mine.map(task=><li key={task.id}>
          <button type="button" className="button subtle" onClick={()=>edit(task)}>{task.title}</button>
          {task.due_date && <small> {deadlineLabel(task.due_date)}</small>}
        </li>)}</ul> : <p>You have no open assignments.</p>}
      </section>
      <section className="bp-panel">
        <h3>Team posts</h3>
        {digest.length > 0 && <p>Past 7 days · {digest.join(' · ')}</p>}
        {newPosts.length ? <ul>{newPosts.slice(0,3).map(post=><li key={post.id}>{post.body.slice(0,160)}</li>)}</ul> :
          <p>You’re caught up on recent posts.</p>}
        <button type="button" className="button subtle" onClick={()=>open('Bulletin')}>
          {newPosts.length ? 'Read ' + newPosts.length + ' recent updates' : 'Open bulletin'}
        </button>
      </section>
    </section>
  );
}

export function mountToday(host:HTMLElement, props:Props) {
  const root = createRoot(host);
  root.render(<Today {...props} />);
  return () => root.unmount();
}
