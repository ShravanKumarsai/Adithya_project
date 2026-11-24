import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase as db } from '../lib/supabase.js';

type PostType = 'announcement' | 'decision' | 'blocker' | 'question' | 'poll';
type Post = { id: string; body: string; author_id: string; bulletin_type: PostType; resolved_at: string | null;
  created_at: string; poll: string[] | null; thread_task: string | null };
type Vote = { message_id: string; option: number; user_id: string };
type Project = { id: string; submission_deadline?: string };
type Member = { user_id: string; full_name: string };
type Task = { id: string; title: string; owner_id: string | null; status: string };
type Props = { project: Project; viewer: string; leader: boolean; members: Member[]; tasks: Task[];
  open: (view: string) => void; onCount: (count: number) => void; };

const types: Record<PostType, string> = {
  announcement: 'Announcement', decision: 'Decision', blocker: 'Blocker / Help', question: 'Question', poll: 'Poll',
};
const filters = ['All', 'Needs me', 'Blockers', 'Decisions'] as const;
type Filter = typeof filters[number];

export function detectPostType(body: string): PostType {
  const text = body.trim();
  if (/^(poll|vote)\b/i.test(text)) return 'poll';
  if (/^(decision|decided|we agreed)\b/i.test(text)) return 'decision';
  if (/\b(blocked|blocker|stuck|need help|cannot proceed)\b/i.test(text)) return 'blocker';
  if (text.endsWith('?') || /^(who|what|when|where|why|how)\b/i.test(text)) return 'question';
  return 'announcement';
}

const message = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Try again.';

function Bulletin({ project, viewer, leader, members, tasks, open, onCount }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [manualType, setManualType] = useState<PostType | ''>('');
  const [options, setOptions] = useState('');
  const [task, setTask] = useState('');
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');
  const [archive, setArchive] = useState(false);
  const [openedAt] = useState(Date.now);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [revision, reload] = useState(0);
  const type = manualType || detectPostType(body);
  const duplicate = body.trim().length > 8 && posts.find(post =>
    !post.resolved_at && post.body.trim().toLocaleLowerCase() === body.trim().toLocaleLowerCase());
  const related = type === 'blocker' && !task && tasks.find(item =>
    item.title.trim().length > 5 && body.toLocaleLowerCase().includes(item.title.trim().toLocaleLowerCase()));

  useEffect(() => {
    let active = true;
    let request = 0;
    async function load() {
      const version = ++request;
      const response = await db.from('project_messages')
        .select('id,body,author_id,bulletin_type,resolved_at,created_at,poll,thread_task,poll_votes(message_id,option,user_id)')
        .eq('project_id', project.id).not('bulletin_type', 'is', null)
        .order('created_at', { ascending: false }).limit(100);
      if (!active || version !== request) return;
      if (response.error) {
        setError(response.error.code === '42703' ? 'Bulletin storage is being set up.' : response.error.message);
      } else {
        const rows = response.data as Array<Post & { poll_votes: Vote[] }>;
        setPosts(rows);
        setVotes(rows.flatMap(row => row.poll_votes || []));
        setError('');
        onCount(0);
        if (rows[0]) sessionStorage.setItem('drafdeck.bulletin.' + viewer + '.' + project.id, rows[0].created_at);
      }
      setLoaded(true);
    }
    void load();
    const channel = db.channel('bulletin-' + project.id + '-' + crypto.randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_messages', filter: 'project_id=eq.' + project.id }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => void load()).subscribe();
    return () => { active = false; void db.removeChannel(channel); };
  }, [project.id, viewer, revision, onCount]);

  async function action(key: string, success: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError('');
    setNotice('Saving…');
    try {
      await work();
      setNotice(success);
      reload(version => version + 1);
    } catch (failure) {
      setNotice('');
      setError(message(failure));
    } finally { setBusy(''); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choices = [...new Set(options.split('\n').map(value => value.trim()).filter(Boolean))];
    if (!body.trim()) return;
    if (type === 'poll' && (choices.length < 2 || choices.length > 5)) {
      setError('Enter 2 to 5 different choices.');
      return;
    }
    void action('post', 'Post shared.', async () => {
      const { error: failure } = await db.from('project_messages').insert({
        project_id: project.id, kind: type === 'poll' ? 'poll' : type === 'decision' ? 'decision' : 'text',
        body: body.trim(), bulletin_type: type, poll: type === 'poll' ? choices : null, thread_task: task || null,
      });
      if (failure) throw failure;
      setBody(''); setManualType(''); setOptions(''); setTask('');
    });
  }

  const expired = (post: Post) => post.bulletin_type !== 'blocker' || post.resolved_at
    ? openedAt - Date.parse(post.resolved_at || post.created_at) >= 30 * 86400000 : false;
  const owned = new Set(tasks.filter(item => item.owner_id === viewer && item.status !== 'done').map(item => item.id));
  const myName = members.find(member => member.user_id === viewer)?.full_name.toLocaleLowerCase();
  const visible = posts.filter(post => (archive || !expired(post)) && (
    filter === 'All' || filter === 'Blockers' && post.bulletin_type === 'blocker' && !post.resolved_at ||
    filter === 'Decisions' && post.bulletin_type === 'decision' ||
    filter === 'Needs me' && (owned.has(post.thread_task || '') || (myName && post.body.toLocaleLowerCase().includes('@' + myName)))
  ) && post.body.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const blockers = posts.filter(post => post.bulletin_type === 'blocker' && !post.resolved_at);

  return (
    <section className="portal-bulletin" aria-labelledby="bulletin-title">
      <h2 id="bulletin-title">Bulletin</h2>
      <div className="portal-pins">
        {project.submission_deadline && <p>Submission due <time dateTime={project.submission_deadline}>{project.submission_deadline}</time> IST</p>}
        {blockers.slice(0, 3).map(post => <p key={post.id}><button type="button" className="button subtle"
          onClick={() => { setSearch(''); setFilter('Blockers'); requestAnimationFrame(() => document.getElementById('post-' + post.id)?.scrollIntoView({block:'center'})); }}>
          {post.body.length > 100 ? post.body.slice(0, 97) + '…' : post.body}</button></p>)}
      </div>
      <form className="portal-post-form" onSubmit={submit}>
        <label htmlFor="bulletin-body">Share a team update</label>
        <textarea id="bulletin-body" maxLength={6000} required value={body} onChange={event => setBody(event.target.value)} />
        <div className="portal-tools">
          <label>Type <select value={type} onChange={event => setManualType(event.target.value as PostType)}>
            {Object.entries(types).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select></label>
          <label>Related task <select value={task} onChange={event => setTask(event.target.value)}>
            <option value="">None</option>{tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select></label>
        </div>
        {duplicate && <p role="status">An open post already has this wording.</p>}
        {related && <div><button type="button" className="button subtle" onClick={() => setTask(related.id)}>
          Link task · {related.title}</button></div>}
        {type === 'poll' && <label>Choices, one per line<textarea required maxLength={500} value={options} onChange={event => setOptions(event.target.value)} /></label>}
        <div><button className="button primary" disabled={Boolean(busy) || !loaded}>Post update</button></div>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" className="button subtle" onClick={() => reload(version => version + 1)}>Reload posts</button></div>}
      <div className="portal-filter" aria-label="Filter posts">
        {filters.map(label => <button type="button" key={label} className="button subtle" aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}
      </div>
      <label>Search posts <input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label><input type="checkbox" checked={archive} onChange={event => setArchive(event.target.checked)} /> Include archived</label>
      {!loaded && <div className="studio-skeleton" role="status"><span className="studio-sr">Loading bulletin</span><i /><i /><i /></div>}
      {loaded && !error && !visible.length && <p>No posts match.</p>}
      {visible.map(post => <article className="portal-post" id={'post-' + post.id} key={post.id}>
        <header><h3>{types[post.bulletin_type]}{post.resolved_at ? ' · Resolved' : ''}</h3>
          <small>{members.find(member => member.user_id === post.author_id)?.full_name || 'Former teammate'} · <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString()}</time></small></header>
        <p>{post.body}</p>
        {post.thread_task && tasks.some(item => item.id === post.thread_task) && <button className="button subtle" type="button" onClick={() => open('Board')}>
          Task · {tasks.find(item => item.id === post.thread_task)?.title}</button>}
        {post.poll?.map((choice, index) => <button className="button subtle" key={choice} type="button" disabled={Boolean(busy)}
          aria-pressed={votes.some(v => v.message_id === post.id && v.user_id === viewer && v.option === index)}
          onClick={() => void action('vote', 'Vote saved.', async () => {
            const { error: failure } = await db.rpc('cast_project_vote', { p_message: post.id, p_option: index });
            if (failure) throw failure;
          })}>{choice} · {votes.filter(v => v.message_id === post.id && v.option === index).length}</button>)}
        {(post.author_id === viewer || leader) && <button className="button subtle" type="button" disabled={Boolean(busy)}
          onClick={() => void action('resolve', post.resolved_at ? 'Reopened.' : 'Resolved.', async () => {
            const { error: failure } = await db.rpc('resolve_bulletin_post', { p_id: post.id, p_resolved: !post.resolved_at });
            if (failure) throw failure;
          })}>{post.resolved_at ? 'Reopen' : 'Mark resolved'}</button>}
      </article>)}
    </section>
  );
}

export function mountBulletin(host: HTMLElement, props: Props) {
  const root = createRoot(host);
  root.render(<Bulletin {...props} />);
  return () => root.unmount();
}
