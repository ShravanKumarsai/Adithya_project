'use strict';
const $ = id => document.getElementById(id);
const svg = {
  spark:'<path d="M12 2l2.3 6.7L21 11l-6.7 2.3L12 20l-2.3-6.7L3 11l6.7-2.3L12 2z"/><path d="M20 2v5m-2.5-2.5h5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  link:'<path d="M10 13a4 4 0 006 0l4-4a4 4 0 00-6-6l-2 2m2 6a4 4 0 00-6 0l-4 4a4 4 0 006 6l2-2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', chevron:'<path d="m9 5 7 7-7 7"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0113-3l2 3M4 15l2 3a8 8 0 0013-3"/>',
  github:'<path d="M9 19c-4 1-4-2-6-2m12 4v-3c0-1 0-2-1-2 4 0 6-2 6-5 0-1 0-2-1-3 0-1 0-2-1-3l-3 1H9L6 5C5 6 5 7 5 8c-1 1-1 2-1 3 0 3 2 5 6 5-1 0-1 1-1 2v3"/>',
  commit:'<path d="M3 12h5m8 0h5"/><circle cx="12" cy="12" r="4"/>',
  vercel:'<path d="M12 4 22 20H2L12 4Z"/>', check:'<path d="m5 12 4 4L19 6"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>'
};
const icon = name => '<svg aria-hidden="true" viewBox="0 0 24 24">' + svg[name] + '</svg>';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const symbol = name => '<i>' + icon(name) + '</i>';
const projectSeed = {name:'Aithya Studio',repo:'ShravanKumarsai/Adithya_project',vercel:'',team:''};
const repoURL = project => 'https://github.com/' + project.repo.split('/').map(encodeURIComponent).join('/');
const commitURL = (project, sha) => repoURL(project) + '/commit/' + encodeURIComponent(sha);
const store = {
  read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  write(key,value) {
    try { localStorage.setItem(key,JSON.stringify(value)); return true; } catch { return false; }
  }
};
let user, projects = [], selected = null, storageKey, serverStorage = false, refreshing = false;
const overview = new Map();
const details = new Map();
const errors = new Map();

function formatDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Date unavailable';
}
const headLine = commit => commit?.message.split('\n')[0] || 'No commits found';
const projectKey = project => project.repo.toLowerCase();
const active = () => projects.find(project => projectKey(project) === selected) || projects[0];
const message = (value, error = false) => '<p class="muted' + (error ? ' error-text' : '') + '">' + escape(value) + '</p>';
const ghLink = (project,sha,label) => '<a class="text-link" target="_blank" rel="noreferrer" href="' + commitURL(project,sha) + '">' + escape(label) + '</a>';
const safeLink = (url,label) => {
  try {
    const link = new URL(url);
    if (link.protocol !== 'https:') return '';
    return '<a class="text-link" target="_blank" rel="noreferrer" href="' + escape(link.href) + '">' + escape(label) + '</a>';
  } catch { return ''; }
};
function summaryStatus(project) {
  const key = projectKey(project), data = overview.get(key) || details.get(key);
  if (errors.has(key + ':overview')) return data ? 'Stale · last read retained' : 'GitHub unavailable';
  if (!data) return 'Fetching GitHub activity…';
  const hasHead = Boolean(data.commits[0]);
  const deploy = data.deployment;
  if (deploy.status === 'Ready' && deploy.comparison === 'Matches latest commit') return 'Latest commit deployed';
  if (deploy.status === 'Ready' && deploy.comparison) return 'Production differs from GitHub';
  if (deploy.status === 'Failed') return 'Production deploy failed';
  if (['Building','Queued','Pending'].includes(deploy.status)) return 'Production deploy ' + deploy.status.toLowerCase();
  return hasHead ? 'Latest commit · ' + formatDate(data.commits[0].date) : 'No commits found';
}

function renderCards() {
  $('all').classList.toggle('selected',selected === null);
  $('project-nav').textContent = '';
  $('cards').textContent = '';
  for (const project of projects) {
    const key = projectKey(project);
    const marker = '<span class="project-marker" aria-hidden="true">' + escape(project.name[0].toUpperCase()) + '</span>';
    const nav = document.createElement('button');
    nav.className = 'side' + (selected === key ? ' selected' : '');
    nav.innerHTML = marker + '<span class="side-label">' + escape(project.name) + '</span>';
    nav.onclick = () => select(project);
    $('project-nav').append(nav);
    const card = document.createElement('button');
    card.className = 'project-card' + (active() === project ? ' current' : '');
    card.innerHTML = marker + '<span><b>' + escape(project.name) + '</b><small>' + escape(summaryStatus(project)) + '</small></span>' + symbol('chevron');
    card.onclick = () => select(project);
    $('cards').append(card);
  }
  $('cards').hidden = selected !== null;
}

function renderDetail() {
  const project = active();
  $('detail').hidden = !project;
  $('crumb').textContent = selected && project ? project.name : 'All projects';
  $('heading').textContent = selected && project ? project.name : 'Project index';
  $('subheading').textContent = selected && project ? project.repo : projects.length + (projects.length === 1 ? ' project in your workspace' : ' projects in your workspace');
  if (!project) return;
  $('project-name').textContent = selected ? 'Latest activity' : project.name;
  $('repo').href = repoURL(project);
  $('change-strip').replaceChildren();
  const key = projectKey(project), data = details.get(key), status = errors.get(key + ':detail');
  const unavailable = status || 'Reading GitHub activity…';
  if (!data) {
    $('brief-source').textContent = 'Based on recent GitHub commits';
    $('timeline-caption').textContent = 'Changes on the default branch';
    $('brief-content').innerHTML = message(unavailable,Boolean(status));
    for (const id of ['commits','deploy','checks']) $(id).innerHTML = message(status ? 'Waiting for source data.' : 'Loading…');
    return;
  }
  $('brief-source').textContent = data.mode + ' · recent changes on ' + data.branch;
  const groups = {};
  for (const commit of data.commits) {
    for (const file of commit.files) {
      const area = file.name.includes('/') ? file.name.split('/')[0] + '/' : 'Root files';
      (groups[area] ||= new Set()).add(file.name);
    }
  }
  const areas = Object.entries(groups).sort((a,b) => b[1].size-a[1].size);
  if (areas.length) {
    const caption = document.createElement('figcaption');
    caption.textContent = 'Changed files by location';
    const bar = document.createElement('div');
    bar.className = 'strip';
    const keyList = document.createElement('div');
    keyList.className = 'strip-key';
    areas.forEach(([area,files],i)=>{
      const ink='ink ink-'+(i%4);
      for (let n=0;n<files.size;n++) {
        const segment=document.createElement('span');
        segment.className=ink;
        segment.title=area+' · '+files.size+' files';
        bar.append(segment);
      }
      const item=document.createElement('span');item.className='legend ink-'+(i%4);
      item.textContent=area+' '+files.size;keyList.append(item);
    });
    $('change-strip').replaceChildren(caption,bar,keyList);
  }
  const stale = status ? message('Refresh failed. Showing the last available activity.',true) : '';
  $('brief-content').innerHTML = stale + (data.brief.length
    ? '<ul class="brief-list">' + data.brief.map(item => '<li>' + escape(item.text) + ' ' +
      ghLink(project,item.sha,item.sha.slice(0,7)) + '</li>').join('') + '</ul>'
    : message(data.commits.length ? 'No changed-file summary is available yet. See the commit history below.' : 'No commits found on this branch.'));
  $('timeline-caption').textContent = 'Default branch · ' + data.branch;
  const opened = new Set(Array.from($('commits').querySelectorAll('details[open]')).map(node => node.dataset.sha));
  $('commits').innerHTML = data.commits.length ? data.commits.map(commit => {
    const files = commit.files.map(file => '<li>' + escape(file.status + ' · ' + file.name) +
      (file.patch ? '<details><summary>View diff excerpt</summary><pre>' + escape(file.patch) + '</pre></details>' : '') + '</li>').join('');
    return '<details data-sha="' + escape(commit.sha) + '"' + (opened.has(commit.sha) ? ' open' : '') + '><summary>' +
      symbol('commit') + '<span><b>' + escape(headLine(commit)) + '</b><small>' + escape(commit.sha.slice(0,7) +
      ' · ' + (commit.author || 'Unknown author') + ' · ' + formatDate(commit.date)) + '</small></span></summary><div class="commit-body">' +
      (files ? '<ul>' + files + '</ul>' : message(commit.detailsAvailable ? 'No changed files listed.' : 'Changed files could not be loaded.')) +
      ghLink(project,commit.sha,'View full commit on GitHub') + '</div></details>';
  }).join('') : message('No recent commits.');
  const deploy = data.deployment;
  const badge = deploy.status === 'Ready' ? 'ready' : deploy.status === 'Failed' ? 'error' : 'warn';
  $('deploy').innerHTML = '<div class="badge ' + badge + '">' + escape(deploy.status) + '</div>' +
    message(deploy.note || [deploy.source,deploy.comparison].filter(Boolean).join(' · ')) +
    (deploy.sha ? '<p>' + ghLink(project,deploy.sha,'Commit ' + deploy.sha.slice(0,7)) + '</p>' : '') +
    safeLink(deploy.statusUrl || deploy.url,deploy.statusUrl ? 'Inspect deployment' : 'Open deployment');
  $('checks').innerHTML = data.checks.length ? '<ul class="check-list">' +
    data.checks.map(check => '<li>' + symbol('check') + '<span>' + escape(check) + '</span></li>').join('') + '</ul>'
    : message('Checks appear when changed-file evidence is available.');
}

async function api(path, options = {}) {
  const response = await fetch(path,{...options,cache:'no-store'});
  let data;
  try { data = await response.json(); } catch { throw new Error('The workspace service returned an unexpected response.'); }
  if (!response.ok) throw new Error(data.error || 'Unable to refresh this source.');
  return data;
}

async function readProject(project, isOverview) {
  const key = projectKey(project), suffix = isOverview ? ':overview' : ':detail', errorKey = key + suffix;
  try {
    const query = new URLSearchParams({repo:project.repo,view:isOverview ? 'overview' : 'detail'});
    if (project.vercel) query.set('vercel',project.vercel);
    if (project.team) query.set('team',project.team);
    const data = await api('/api/activity?' + query);
    if (projects.find(item=>projectKey(item)===key) !== project) return;
    (isOverview ? overview : details).set(key,data);
    if (!isOverview) { overview.set(key,data); errors.delete(key + ':overview'); }
    errors.delete(errorKey);
  } catch (error) {
    if (projects.find(item=>projectKey(item)===key) === project) errors.set(errorKey,error.message);
  }
}

function syncLabel(label, failed = false) {
  $('sync-state').classList.toggle('failed',failed);
  $('sync-state').innerHTML = '<span class="dot"></span> ' + escape(label);
}
async function refresh() {
  if (!user || refreshing || !projects.length) return;
  refreshing = true;
  $('refresh').disabled = true;
  syncLabel('Refreshing…');
  try {
    const current = active();
    await Promise.all([
      readProject(current,false),
      ...projects.filter(project => project !== current).map(project => readProject(project,true))
    ]);
    if (active() && current !== active() && !details.has(projectKey(active()))) await readProject(active(),false);
    renderCards();
    renderDetail();
    syncLabel(errors.size ? 'Some sources need attention' : 'Auto-refresh on',Boolean(errors.size));
  } finally {
    refreshing = false;
    $('refresh').disabled = false;
  }
}
function select(project) {
  selected = project ? projectKey(project) : null;
  const nextUrl=new URL(location.href);if(selected)nextUrl.searchParams.set('project',selected);else nextUrl.searchParams.delete('project');history.replaceState(null,'',nextUrl);
  renderCards();
  renderDetail();
  document.dispatchEvent(new Event('project-selected'));
  refresh();
}

function openDialog(title,content) {
  $('dialog-title').textContent = title;
  $('dialog-content').innerHTML = content;
  if (!$('dialog').open) $('dialog').showModal();
}
function repositoryInput(text) {
  const value = text.trim();
  if (!value.includes('://')) return value.replace(/\.git$/i,'');
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return '';
    return parsed.pathname.replace(/^\/|\/$/g,'').replace(/\.git$/i,'');
  } catch { return ''; }
}

async function saveProjects(next) {
  if (serverStorage) {
    await api('/api/projects',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
    projects = next;
    return;
  }
  const saved = store.write(storageKey,next);
  projects = next;
  if (!saved) syncLabel('Project list could not be saved in this browser',true);
}

function projectForm(current) {
  if (!user) return;
  openDialog(current ? 'Project settings' : 'Add a project',
    '<form id="project-form"><label for="project-display">Project name</label><input id="project-display" required maxlength="55" value="' + escape(current?.name) +
    '"><label for="project-repo">GitHub repository</label><input id="project-repo" required maxlength="165" placeholder="owner/repository" value="' + escape(current?.repo) +
    '"><label for="project-vercel">Vercel project ID <small>(optional)</small></label><input id="project-vercel" maxlength="68" placeholder="prj_…" value="' + escape(current?.vercel) +
    '"><label for="project-team">Vercel team ID <small>(optional)</small></label><input id="project-team" maxlength="69" placeholder="team_…" value="' + escape(current?.team) +
    '"><p class="muted error-text" id="form-error" role="alert"></p><div class="dialog-actions"><button class="button primary" type="submit">Save project</button>' +
    (current ? '<button class="button subtle" id="remove" type="button">Remove from workspace</button>' : '') + '</div></form>');
  $('project-form').onsubmit = async event => {
    event.preventDefault();
    const name = $('project-display').value.trim(), repo = repositoryInput($('project-repo').value);
    const vercel = $('project-vercel').value.trim(), team = $('project-team').value.trim();
    const error = !name ? 'Enter a project name.' :
      !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) || /\/(\.|\.\.)$/.test(repo) ? 'Use a GitHub repository URL or owner/repository.' :
      vercel && !/^prj_[A-Za-z0-9]{8,64}$/.test(vercel) ? 'Use a Vercel project ID beginning with prj_.' :
      team && !/^team_[A-Za-z0-9]{8,64}$/.test(team) ? 'Use a Vercel team ID beginning with team_.' :
      projects.some(project => project !== current && project.repo.toLowerCase() === repo.toLowerCase()) ? 'This repository is already in your workspace.' :
      !current && projects.length >= 12 ? 'This workspace supports up to 12 projects.' : '';
    if (error) { $('form-error').textContent = error; return; }
    const replacement = {name,repo,vercel,team};
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      await saveProjects(current ? projects.map(project=>project===current?replacement:project) : [...projects,replacement]);
    } catch (failure) {
      $('form-error').textContent = failure.message;
      if (submit) submit.disabled = false;
      return;
    }
    if (current) evict(current);
    $('dialog').close();
    select(replacement);
  };
  if (current) $('remove').onclick = async event => {
    event.currentTarget.disabled = true;
    try {
      await saveProjects(projects.filter(project=>project!==current));
    } catch (failure) {
      $('form-error').textContent = failure.message;
      $('remove').disabled = false;
      return;
    }
    evict(current);
    $('dialog').close();
    select(null);
  };
}
function evict(project) {
  const key = projectKey(project);
  overview.delete(key);
  details.delete(key);
  errors.delete(key + ':detail');
  errors.delete(key + ':overview');
}
function connections() {
  const project = active();
  openDialog('Connections','<div class="connection"><b>GitHub</b><p class="muted">Public repositories are read automatically. GitHub activity refreshes once a minute while this workspace is visible.</p></div>' +
    '<div class="connection"><b>Vercel</b><p class="muted">' + escape(user?.vercelConfigured ?
      'Direct Vercel access is configured. Add a Vercel project ID to see its production status.' :
      'Production status is available when Vercel reports it to GitHub. Direct access requires a server-side Vercel token.') +
    '</p></div><div class="connection"><b>Progress brief</b><p class="muted">' + escape(user?.aiConfigured ?
      'AI uses recent commit messages and changed-file excerpts. A file-change digest is available when AI cannot respond.' :
      'The file-change digest uses GitHub evidence. AI-assisted briefs require a server-side OpenAI key.') +
    '</p></div>' + (project ? '<button class="button primary" id="edit-project">Edit ' + escape(project.name) + '</button>' : ''));
  if (project) $('edit-project').onclick = () => projectForm(project);
}
function profile() {
  if (!user) return;
  openDialog('Your profile','<p><b>' + escape(user.name) + '</b></p>' + message(user.email) +
    '<div class="connection"><b>Your projects</b><p class="muted">' + projects.length +
    ' ' + (projects.length===1?'repository':'repositories') + (serverStorage ? ' saved to your account.' : ' saved in this browser.') + '</p></div><div class="dialog-actions"><a class="button subtle" href="/signout-with-chatgpt?return_to=/" target="_top">Sign out</a></div>');
}
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
$('all').onclick = () => select(null);
$('source-nav').onclick = connections;
$('refresh').onclick = refresh;
$('add-main').onclick = $('add-side').onclick = () => projectForm();
$('profile').onclick = profile;
$('close').onclick = () => $('dialog').close();
setInterval(() => { if (!document.hidden) refresh(); },60000);
document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(); });

async function start() {
  try {
    user = await api('/api/profile');
    $('name').textContent = user.name;
    $('avatar').textContent = user.name[0].toUpperCase();
    storageKey = 'aithya.projects.' + user.id;
    const stored = store.read(storageKey,[projectSeed]);
    projects = Array.isArray(stored) ? stored : [projectSeed];
    try {
      const data = await api('/api/projects');
      serverStorage = true;
      if (Array.isArray(data.projects)) projects = data.projects;
    } catch {
      serverStorage = false;
    }
    const key=new URLSearchParams(location.search).get('project');
    if(key && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(key) && !projects.some(p=>projectKey(p)===key)){
      projects.push({name:key.split('/')[1],repo:key,vercel:'',team:''});
    }
    selected=projects.some(p=>projectKey(p)===key)?key:null;
    renderCards();
    renderDetail();
    await refresh();
  } catch (error) {
    $('cards').innerHTML = '<div class="empty">' + message(error.message,true) + '</div>';
    syncLabel('Workspace unavailable',true);
  }
}
start();
