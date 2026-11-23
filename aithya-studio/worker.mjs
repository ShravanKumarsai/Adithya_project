import { github, isRepo } from "./server/github.mjs";
import { assets } from 'studio:assets';
import { supabasePublishableKey, supabaseUrl } from './src/lib/supabase-config.js';
import { json, responseHeaders, timedFetch, truncate } from './server/http.mjs';
import { planningResponse, projectGeminiKey, projectGeminiKeyResponse, revealIntegration, uuidPattern } from './planning-api.mjs';
import { studioAssist } from './assist-api.mjs';
import { setupRulebookResponse } from './setup-rulebook-api.mjs';

const shaPattern = /^[0-9a-f]{40}$/i;
const cache = new Map();
const activityTTL = 60000;
const https = value => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
};
function deploymentInfo(state, sha, url, source, latest, statusUrl) {
  const status = ({ READY:'Ready', success:'Ready', ERROR:'Failed', error:'Failed', failure:'Failed',
    BUILDING:'Building', INITIALIZING:'Building', QUEUED:'Queued', queued:'Queued',
    pending:'Pending', in_progress:'Building', CANCELED:'Canceled', inactive:'Inactive' })[state] || 'Unknown';
  return {status, sha:shaPattern.test(sha || '') ? sha : null, url:https(url), statusUrl:https(statusUrl), source,
    comparison:sha && latest ? (sha === latest ? 'Matches latest commit' : 'Different from latest commit') : null};
}

async function deployment(env, path, vercel, team, latest, token) {
  if (vercel && token) {
    const scope = new URLSearchParams();
    if (team) scope.set('teamId', team);
    const query = new URLSearchParams(scope);
    query.set('projectId', vercel);
    query.set('limit', '10');
    const get = route => timedFetch('https://api.vercel.com' + route, {
      headers:{Authorization:'Bearer ' + token}
    });
    const [latestResponse, projectResponse] = await Promise.all([
      get('/v6/deployments?' + query),
      get('/v9/projects/' + encodeURIComponent(vercel) + '?' + scope)
    ]);
    if (!latestResponse.ok || !projectResponse.ok) return {status:'Unavailable', source:'Vercel',
      note:'Check the project ID, team ID and token access in your project connections.'};
    const project = await projectResponse.json();
    const production = project.targets?.production;
    const rows=(await latestResponse.json()).deployments||[];
    const row=rows.find(row=>row.target==="production");
    const info = row ? deploymentInfo(row.readyState || row.state, row.meta?.githubCommitSha || row.gitSource?.sha,
      null, 'Vercel', latest, row.inspectorUrl) : {status:'No production deployment',source:'Vercel'};
    if (production?.readyState === 'READY') {
      const hosts = [...(Array.isArray(production.alias) ? production.alias : []), production.url]
        .filter(host => typeof host === 'string' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host));
      const host = hosts.find(h => !h.endsWith('.vercel.app')) || hosts[0];
      if (host) info.url = 'https://' + host;
    }
    info.history=rows.slice(0,8).map(entry=>({
      ...deploymentInfo(entry.readyState||entry.state,entry.meta?.githubCommitSha||entry.gitSource?.sha,
        entry.url&&/^[-.a-z0-9]+$/i.test(entry.url)?"https://"+entry.url:null,"Vercel",latest,entry.inspectorUrl),
      target:entry.target||"preview",date:entry.createdAt,author:truncate(entry.creator?.username,80)
    }));
    return info;
  }
  if (!path || !env.GITHUB_TOKEN) return {status:'Awaiting connection',source:'Vercel', note:'Add a Vercel project ID and access token in Activity.'};
  const rows = await github(env, path + '/deployments','?per_page=8');
  const production = rows.filter(row => row.production_environment || /production/i.test(row.environment || '')).slice(0,3);
  const statuses = await Promise.all(production.map(async row => {
    const data = await github(env, path + '/deployments/' + Number(row.id) + '/statuses','?per_page=1');
    return {row, status:data[0]};
  }));
  for (const {row,status} of statuses) {
    const links = [status?.environment_url, status?.target_url, status?.log_url].map(https).filter(Boolean);
    const vercelLink = links.find(link => /(^|\.)vercel\.(com|app)$/.test(new URL(link).hostname));
    if (vercelLink || /vercel/i.test(status?.creator?.login || row.creator?.login || '')) {
      return deploymentInfo(status?.state, row.sha, status?.state === 'success' ? status.environment_url : null,
        'Vercel via GitHub', latest, status?.log_url);
    }
  }
  return {status:'Unlinked', source:'Vercel', note:vercel
    ? 'Your project leader can add a Vercel access token in Activity. GitHub returned no recent Vercel production deployment.'
    : 'GitHub returned no recent Vercel production deployment.'};
}

function summarize(commits) {
  const files = [...new Set(commits.flatMap(commit => commit.files.map(file => file.name)))];
  const categories = [
    [/auth|session|login|invit|onboard|access/i,'Account access and onboarding','Retest sign-in, invitation acceptance, and access with a separate member account.'],
    [/migrations|schema|polic|storage|supabase/i,'Database and storage','Verify the database and storage changes in a preview environment.'],
    [/vercel|deploy|build|config|lock|package\.json|\.env/i,'Build and configuration','Check the production build and compare its commit with the latest GitHub commit.'],
    [/\.tsx?$|\.jsx?$|\.css$|\.html$/i,'Application code','Smoke-test the affected screens and primary flows in a preview.'],
    [/readme|docs\//i,'Documentation','Check that the setup instructions match the current build.']
  ];
  const matching = categories.filter(([pattern]) => files.some(file => pattern.test(file)));
  return {
    brief:matching.slice(0,4).map(([pattern,label]) => ({
      text:label + ' changed in ' + truncate(files.find(file => pattern.test(file)),120) + '.',
      sha:commits.find(commit => commit.files.some(file => pattern.test(file.name)))?.sha
    })),
    checks:matching.slice(0,3).map(([, , check]) => check)
  };
}

function keep(map, key, value) {
  if (map.size >= 100) map.delete(map.keys().next().value);
  map.set(key, value);
}
async function activity(env, repository, vercel, team, overview, token) {
  const path = '/repos/' + repository.split('/').map(encodeURIComponent).join('/');
  let repo, rows = [], githubNote = '';
  if (isRepo(repository)) {
    try {
      repo = await github(env, path);
      rows = await github(env,path + '/commits','?' + new URLSearchParams({sha:repo.default_branch,per_page:overview ? '1' : '6'}));
    } catch (error) { githubNote = error.message; }
  } else githubNote = 'Connect a GitHub repository to see commits.';
  const deploymentRequest = deployment(env, isRepo(repository) ? path : null, vercel, team, rows[0]?.sha, token).catch(() => ({
    status:'Unavailable', source:'Deployment provider', note:'Deployment status could not be fetched. GitHub activity is shown independently.'
  }));
  const pullRequest = repo ? github(env,path+'/pulls','?state=all&sort=updated&direction=desc&per_page=50').catch(()=>null) : null;
  const commits = await Promise.all(rows.filter(row => shaPattern.test(row.sha)).map(async row => {
    const info = overview ? null : await github(env,path + '/commits/' + row.sha,'?per_page=30').catch(() => null);
    return {sha:row.sha,message:truncate(row.commit?.message,420),date:row.commit?.committer?.date,
      author:truncate(row.commit?.author?.name || row.author?.login,75),
      files:(info?.files || []).slice(0,24).map(file => ({
        name:truncate(file.filename,300),status:truncate(file.status,14),
        patch:/(^|\/)(\.env(?:\.|$)|[^/]*\.(pem|key)$)/i.test(file.filename) ? '' : truncate(file.patch,1250)
      })), detailsAvailable:Boolean(info)};
  }));
  const pulls=await pullRequest;
  const contributions=new Map();
  function contributor(login){if(!contributions.has(login))contributions.set(login,{login,commits:0,pulls:0});return contributions.get(login)}
  rows.forEach(c=>contributor(c.author?.login||c.commit?.author?.name||"Unknown").commits++);
  pulls?.forEach(pr=>contributor(pr.user?.login||"Unknown").pulls++);
  return {contributors:[...contributions.values()],pullsAvailable:Array.isArray(pulls),repository:repo?.full_name || repository,branch:repo?.default_branch,githubNote,commits,deployment:await deploymentRequest,updatedAt:new Date().toISOString()};
}

function authorized(headers) {
  const id = headers.get('oai-authenticated-user-id');
  if (!id) return null;
  const email = headers.get('oai-authenticated-user-email') || '';
  let name = headers.get('oai-authenticated-user-full-name') || '';
  if (headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') {
    try { name = decodeURIComponent(name); } catch { name = ''; }
  }
  return {id,email,name:name || email.split('@')[0] || 'Member'};
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const user = authorized(request.headers);
    if (!user) {
      if (url.pathname.startsWith('/api/')) return json({error:'Sign in to view your workspace.'},401);
      return new Response('<!doctype html><title>Aithya Studio</title><main style="font:20px system-ui;padding:3rem"><h1>Aithya Studio</h1><p><a href="/signin-with-chatgpt?return_to=/">Sign in to your workspace</a></p></main>',{status:401,headers:{...responseHeaders,'content-type':'text/html; charset=utf-8'}});
    }
    if (url.pathname === '/api/assist') return studioAssist(request,env,url,user);
    if (url.pathname === '/api/setup/rulebook') return setupRulebookResponse(request,env,url,user);
    if (url.pathname === '/api/planning') return planningResponse(request,env,url,user);
    if (url.pathname === '/api/github/token') return projectGeminiKeyResponse(request,env,url,'github');
    if (url.pathname === '/api/vercel/token') return projectGeminiKeyResponse(request,env,url,true);
    if (url.pathname === '/api/planning/key') return projectGeminiKeyResponse(request,env,url);
    if (request.method !== 'GET') return json({error:'Method not allowed.'},405);
    if (url.pathname === '/api/profile') return json({...user, vercelConfigured:Boolean(env.VERCEL_TOKEN), aiConfigured:Boolean(env.OPENAI_API_KEY)});
    if (url.pathname === '/api/activity') {
      const id = url.searchParams.get('project');
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) return json({error:'Sign in to Aithya to see project activity.'},401);
      if (!uuidPattern.test(id || '')) return json({error:'Select a shared project.'},400);
      let settings;
      try {
        const response = await timedFetch(supabaseUrl + '/rest/v1/projects?id=eq.' + id +
          '&select=repository,vercel_project_id,vercel_team_id', {headers:{authorization,apikey:supabasePublishableKey}});
        if (!response.ok) return json({error:'Could not read project connections.'},response.status);
        [settings] = await response.json();
      } catch { return json({error:'Project connections are temporarily unavailable.'},503); }
      if (!settings) return json({error:'Project unavailable.'},404);
      const {repository:repo,vercel_project_id:vercel,vercel_team_id:team} = settings;

      const overview = false;
      let key;
      try {
        const githubStored = repo && await projectGeminiKey(env,id.toLowerCase(),"github").catch(error=>{if(error.code==="42P01")return null;throw error});
        const stored = vercel && await projectGeminiKey(env, id.toLowerCase(), true);
        key = JSON.stringify([id,repo,vercel,team,stored?.nonce,githubStored?.nonce]);
        let entry = cache.get(key);
        if (!entry || Date.now() - entry.time >= activityTTL) {
          const token = stored ? await revealIntegration(env,id.toLowerCase(),'vercel',stored) : env.VERCEL_TOKEN;
          entry = {time:Date.now(), promise:activity({...env,GITHUB_CACHE_SCOPE:key,GITHUB_TOKEN:githubStored?await revealIntegration(env,id.toLowerCase(),'github',githubStored):env.GITHUB_TOKEN},repo || '',vercel,team,overview,token)};
          keep(cache,key,entry);
        }
        const data = await entry.promise;
        const {brief,checks} = summarize(data.commits);
        return json({...data, commits:data.commits.map(({files,...commit}) => commit), brief,checks});
      } catch (error) {
        if (key !== undefined) cache.delete(key);
        return json({error:truncate(error.message || 'Source temporarily unavailable.',180)},502);
      }
    }
    const asset = assets[url.pathname === '/' ? '/shared' : url.pathname];
    if (!asset) return new Response('Not found',{status:404,headers:responseHeaders});
    const bytes = asset[2] ? Uint8Array.from(atob(asset[1]), (byte) => byte.charCodeAt(0)) : asset[1];
    return new Response(bytes,{headers:{...responseHeaders,'content-type':asset[0],
      'content-security-policy':"default-src 'self'; connect-src 'self' https://ekqfotmlnqqrbcizjtfz.supabase.co wss://ekqfotmlnqqrbcizjtfz.supabase.co; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'self'"}});
  }
};
