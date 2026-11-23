import test from "node:test";
import assert from "node:assert/strict";
import { collectWizardPolicy } from "../src/wizard-policy.js";
import { readRulebook, rulebookSuggestions } from "../src/rulebook-import.js";
import { rulebookLimit } from "../src/lib/rulebook-limits.js";
import { setupRulebookResponse } from "../setup-rulebook-api.mjs";
import {
  normalizePlan,
  permittedGeminiModel,
  planningResponse,
} from "../planning-api.mjs";
import { github } from "../server/github.mjs";
import { escape, tabButton } from "../src/studio-ui.js";
import { todayView } from "../src/project-insights.js";

const user = { id: "10000000-0000-4000-8000-000000000001" };
const projectId = "20000000-0000-4000-8000-000000000001";
const host = "https://workspace.example";
const fakeDB = (caps = new Map(), key = null) => ({
  prepare(statement) {
    return {
      bind(account, day, limit) {
        const bucket = account + day;
        return {
          first: async () => key,
          run: async () => {
            const previous = caps.get(bucket) || 0;
            const reservation = statement.startsWith("INSERT");
            const permitted = reservation ? previous < limit : previous > 0;
            if (permitted) caps.set(bucket, previous + (reservation ? 1 : -1));
            return { meta: { changes: Number(permitted) } };
          },
        };
      },
    };
  },
});
const providerDraft = (data) =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(data) }] },
      },
    ],
  });
const usage = (caps) =>
  [...caps.values()].reduce((total, count) => total + count, 0);

test("wizard saves policy keys only and preserves booleans", () => {
  const policy = collectWizardPolicy(
    {
      judging_criteria: "Research",
      external_ai_apis_allowed: "on",
      other_requirements: "Confirm first",
      permitted_models: " gemini-test\n\n",
    },
    { gemini_planning_allowed: true, mandatory_requirements: "pollution" },
  );
  assert.deepEqual(policy.permitted_models, ["gemini-test"]);
  assert.equal(policy.external_ai_apis_allowed, true);
  assert.equal(policy.ai_generated_code_allowed, false);
  assert.equal(policy.gemini_planning_allowed, true);
  assert.equal(policy.other_requirements, "Confirm first");
  assert.equal("judging_criteria" in policy, false);
  assert.equal("mandatory_requirements" in policy, false);
});

test("rulebook parser pre-fills known fields and rejects files above the shared limit", async () => {
  const found = rulebookSuggestions(
    "Hackathon name: River Jam\nSubmission deadline: 2027-02-03",
    {},
  );
  assert.ok(found.some((field) => field.value === "River Jam"));
  assert.ok(found.some((field) => field.value === "2027-02-03"));
  await assert.rejects(readRulebook({ size: rulebookLimit + 1 }), /8 MB/);
});

test("scanner refunds both counters on upstream failure, charges once on success, refunds a partial reservation", async (t) => {
  const caps = new Map();
  let upstream = () => new Response(null, { status: 429 });
  t.mock.method(globalThis, "fetch", async (url) =>
    String(url).includes("/auth/") ? Response.json(user) : upstream(),
  );
  const endpoint = new URL(host + "/api/setup/rulebook");
  const call = () =>
    setupRulebookResponse(
      new Request(endpoint, {
        method: "POST",
        headers: {
          origin: host,
          "content-type": "application/pdf",
          authorization: "Bearer fixture",
        },
        body: "%PDF-test",
      }),
      { GEMINI_SETUP_API_KEY: "fake", DB: fakeDB(caps) },
      endpoint,
      user,
    );
  assert.equal((await call()).status, 429);
  assert.equal(usage(caps), 0);
  upstream = () =>
    providerDraft({
      fields: [{ label: "Hackathon name", value: "River Jam" }],
    });
  const good = await call();
  assert.equal(good.status, 200);
  assert.equal(usage(caps), 2);
  const site = [...caps.keys()].find((key) => key.startsWith("setup:site"));
  caps.set(site, 80);
  const reachingLimit = await call();
  assert.equal(reachingLimit.status, 429);
  assert.deepEqual(Object.keys(await reachingLimit.json()).sort(), [
    "code",
    "error",
    "limit",
    "resetsAt",
    "used",
  ]);
  assert.equal(usage(caps), 81);
});

test("planning refunds invalid output and keeps a completed draft charged", async (t) => {
  const caps = new Map();
  const secret = new Uint8Array(32);
  const nonce = new Uint8Array(12);
  const key = await crypto.subtle.importKey("raw", secret, "AES-GCM", false, [
    "encrypt",
  ]);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: new TextEncoder().encode(projectId),
    },
    key,
    new TextEncoder().encode("fake"),
  );
  const base64 = (bytes) => Buffer.from(bytes).toString("base64");
  const env = {
    PROJECT_GEMINI_KEY_SECRET: base64(secret),
    DB: fakeDB(caps, { nonce: base64(nonce), ciphertext: base64(ciphertext) }),
  };
  const valid = {
    summary: "Build the smallest demo",
    phases: [
      { title: "Demo", outcome: "A working screen", tasks: ["Build a screen"] },
    ],
    risks: [],
  };
  const policy = {
    external_ai_apis_allowed: true,
    gemini_planning_allowed: true,
    permitted_models: [],
    permitted_ai_tools: [],
    prohibited_ai_tools: [],
  };
  let output = {};
  t.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname;
    if (path.startsWith("/auth/")) return Response.json(user);
    if (path.endsWith("/projects"))
      return Response.json([
        { leader_id: user.id, name: "Demo", problem_statement: "Need a demo" },
      ]);
    if (path.endsWith("/project_ai_constraints"))
      return Response.json([policy]);
    if (path.startsWith("/rest/")) return Response.json([]);
    return providerDraft(output);
  });
  const endpoint = new URL(host + "/api/planning");
  const call = () =>
    planningResponse(
      new Request(endpoint, {
        method: "POST",
        headers: {
          origin: host,
          "content-type": "application/json",
          authorization: "Bearer fixture",
        },
        body: JSON.stringify({
          projectId,
          templateId: "mvp-sprint",
          approved: true,
        }),
      }),
      env,
      endpoint,
      user,
    );
  assert.equal((await call()).status, 502);
  assert.equal(usage(caps), 0);
  output = valid;
  assert.deepEqual((await (await call()).json()).plan, normalizePlan(valid));
  assert.equal(usage(caps), 1);
  assert.equal(
    permittedGeminiModel(
      { ...policy, prohibited_ai_tools: ["Gemini"] },
      "gemini-test",
    ),
    null,
  );
});

test("GitHub cache revalidates against ETags and separates workspaces", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls.push(init.headers["If-None-Match"]);
    return init.headers["If-None-Match"]
      ? new Response(null, { status: 304 })
      : Response.json(
          { default_branch: "main" },
          { headers: { etag: '"fixture"' } },
        );
  });
  const call = (scope) =>
    github(
      { GITHUB_TOKEN: "fixture", GITHUB_CACHE_SCOPE: scope },
      "/repos/team/demo",
    );
  await call("a");
  assert.deepEqual(await call("a"), { default_branch: "main" });
  await call("b");
  assert.deepEqual(calls, [undefined, '"fixture"', undefined]);
});

test("navigation escapes dynamic labels and Today switches to crunch mode", () => {
  const markup = tabButton('bad"id', "<script>", true, "panel");
  assert.match(markup, /role="tab"/);
  assert.match(markup, /bad&quot;id/);
  assert.doesNotMatch(markup, /<script>/);
  const html = todayView({
    projects: [
      { id: projectId, name: "<Draft>", submission_deadline: "2027-01-02" },
    ],
    totals: [],
    tasks: [],
    blocked: [],
    events: [],
    escape,
    now: new Date("2027-01-01T12:00:00"),
  });
  assert.match(html, /Crunch mode/);
  assert.match(html, /Check deployment/);
  assert.doesNotMatch(html, /<Draft>|My day/);
});
