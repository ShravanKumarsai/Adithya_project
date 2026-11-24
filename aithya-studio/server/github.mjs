import { timedFetch } from "./http.mjs";

const base = "https://api.github.com";
const repoPattern = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
export const isRepo = (value) =>
  typeof value === "string" &&
  repoPattern.test(value) &&
  !/\/(\.|\.\.)$/.test(value);
const githubCache = new Map();
const githubBackoff = new Map();
function keep(map, key, value) {
  if (map.size >= 100) map.delete(map.keys().next().value);
  map.set(key, value);
}
export async function github(env, path, parameters = "") {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Aithya-Studio",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = env.GITHUB_TOKEN;
  if (!token)
    throw Error(
      "Add a GitHub token in Connections to sync repository activity.",
    );
  headers.Authorization = "Bearer " + token;
  const scope = env.GITHUB_CACHE_SCOPE;
  const key = JSON.stringify([scope, path, parameters]);
  const cached = scope ? githubCache.get(key) : null;
  if (cached?.etag) headers["If-None-Match"] = cached.etag;
  const now = Date.now();
  const retryAt = githubBackoff.get(scope);
  const limitMessage = (until) =>
    "GitHub rate limit reached. Retry after " +
    new Date(until).toISOString().slice(11, 16) +
    " UTC.";
  if (retryAt > now) throw Error(limitMessage(retryAt));
  const result = await timedFetch(
    base + path + parameters,
    { headers },
    10000,
    true,
  );
  if (result.status === 304 && cached) return cached.data;
  if (result.status === 409 && path.endsWith("/commits")) return [];
  if (!result.ok) {
    const rateLimited =
      result.status === 429 ||
      result.headers.has("retry-after") ||
      result.headers.get("x-ratelimit-remaining") === "0";
    if (rateLimited) {
      const seconds = Number(result.headers.get("retry-after")) || 0;
      const reset = Number(result.headers.get("x-ratelimit-reset")) * 1000;
      const until = Math.max(now + Math.max(60, seconds) * 1000, reset);
      if (scope) keep(githubBackoff, scope, until);
      throw Error(limitMessage(until));
    }
    throw Error(
      result.status === 404
        ? "GitHub could not find this repository or grant access."
        : "GitHub is temporarily unavailable (" + result.status + ").",
    );
  }
  const data = await result.json();
  const etag = result.headers.get("etag");
  if (etag && scope) keep(githubCache, key, { etag, data });
  return data;
}

export async function hackathonCommitWindow(env, path, branch, {start, end}) {
  const since = new Date(start + "T00:00:00+05:30");
  const until = end ? new Date(end + "T23:59:59+05:30") : new Date();
  if (!Number.isFinite(since.getTime()) || !Number.isFinite(until.getTime()) || until < since) return null;
  const parameters = new URLSearchParams({sha:branch,since:since.toISOString(),until:until.toISOString(),per_page:"100"});
  const dates = [];
  const contributors = new Map();
  let count = 0, truncated = false;
  for (let page=1; page<=5; page++) {
    parameters.set("page",String(page));
    const rows = await github(env,path + "/commits","?" + parameters);
    count += rows.length;
    for (const row of rows) {
      const date = row.commit?.committer?.date;
      if (Number.isFinite(Date.parse(date))) dates.push(date);
      const name = row.commit?.author?.name;
      const login = row.author?.login || name;
      if (login) {
        const contributor = contributors.get(login) || {login,names:new Set(),commits:0};
        if (name) contributor.names.add(name);
        contributor.commits++;
        contributors.set(login,contributor);
      }
    }
    if (rows.length < 100) break;
    truncated = page === 5;
  }
  dates.sort();
  return {first:dates[0] || "",last:dates.at(-1) || "",count,truncated,
    contributors:[...contributors.values()].map(({login,names,commits})=>({login,names:[...names],commits}))};
}
