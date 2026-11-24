import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
let origin;
const user = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const project = "20000000-0000-4000-8000-000000000001";
const key = "sb-ekqfotmlnqqrbcizjtfz-auth-token";
const now = new Date().toISOString();
const fixture = {
  projects: [
    {
      id: project,
      leader_id: user,
      name: "Studio QA project with a long name",
      archived_at: null,
      repository: "",
      start_date: "2026-11-21",
      submission_deadline: "2027-01-30",
      created_at: now,
      updated_at: now,
      expected_deliverables: ["Prototype"],
      technology_stack: ["React"],
      submission_evidence: {},
    },
  ],
  project_members: [
    {
      user_id: user,
      full_name: "Riya Tester",
      status: "accepted",
      is_leader: true,
      role: "Lead",
      preliminary_skills: [],
    },
    {
      user_id: other,
      full_name: "Arun, teammate",
      status: "accepted",
      role: "Builder",
      preliminary_skills: [],
    },
  ],
  project_plans: [
    {
      plan: {
        summary: "Prepare the demo",
        phases: [
          {
            title: "Build",
            outcome: "Working demo",
            tasks: ["Ship from saved plan"],
          },
        ],
        risks: [],
      },
      model: "gemini-fixture",
      updated_at: now,
    },
  ],
  project_ai_constraints: [
    {
      external_ai_apis_allowed: false,
      gemini_planning_allowed: false,
      permitted_ai_tools: [],
      prohibited_ai_tools: [],
      permitted_models: [],
      privacy_restrictions: "",
      other_requirements: [],
      data_handling: "",
    },
  ],
  requirement_items: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      title: "Provide working prototype",
      description: "Demonstrate the smallest useful part.",
      verified: true,
    },
  ],
  user_skills: [
    {
      user_id: user,
      skill_name: "React",
      self_assessed_level: "advanced",
      verified_level: "advanced",
    },
  ],
  project_requirements: [
    { mandatory_requirements: [], restrictions: [], judging_criteria: [] },
  ],
  project_tasks: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      owner_id: user,
      title: "Build a card with a detailed status label",
      status: "open",
      skill: "React",
      estimated_hours: 4,
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      owner_id: other,
      title: "Test integration with a deliberately long line that still fits",
      status: "review",
      blocked_by: "30000000-0000-4000-8000-000000000001",
      skill: "React",
      estimated_hours: 6,
    },
  ],
  member_availability: [{ user_id: user, weekly_hours: 8 }],
  milestones: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      name: "Demo checkpoint",
      done: false,
      due: "2027-01-21",
    },
  ],
  studio_member_details: [
    {
      user_id: user,
      expertise: "React",
      history: "Hackathon team",
      ratings: { React: 3 },
      role_draft: {
        role: "Frontend lead",
        why: "Builds the interface.",
        areas: ["Board", "Navigation"],
      },
    },
  ],
  studio_threads: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      topic: "Help with React",
      skill: "React",
      creator_id: other,
      resolved: false,
    },
  ],
  studio_thread_members: [
    {
      thread_id: "50000000-0000-4000-8000-000000000001",
      user_id: user,
      last_read: "-infinity",
    },
  ],
  studio_standups: [],
  studio_item_briefs: [],
  studio_timeline_proposals: [],
  studio_reports: [],
  studio_portfolio_history: [],
  studio_thread_messages: [
    {
      thread_id: "50000000-0000-4000-8000-000000000001",
      author_id: other,
      body: "Can you review this component?",
      created_at: now,
    },
  ],
  studio_ai_accounts: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      user_id: user,
      tool: "Gemini",
      handle: "Personal",
      unit: "Requests",
      allowance: 30,
      used: 7,
      reset_at: "2027-01-01T18:00:00Z",
      window_hours: 4,
      shared: false,
    },
  ],
};
const app = createServer(async (req, res) => {
  const url = new URL(req.url, origin);
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify(
        url.pathname.endsWith("/activity")
          ? {
              repository: "",
              deployment: { status: "Awaiting connection", source: "Vercel" },
              commits: [],
              contributors: [],
              brief: [],
              updatedAt: now,
            }
          : { configured: false, templates: [], remaining: 50 },
      ),
    );
  }
  const file = path.join(
    process.cwd(),
    "public-vercel",
    url.pathname === "/" || url.pathname === "/shared"
      ? "index.html"
      : url.pathname,
  );
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
  };
  try {
    const bytes = await readFile(file);
    res.writeHead(200, {
      "content-type": types[path.extname(file)] || "text/plain",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
(async () => {
  await new Promise((done) => app.listen(0, "127.0.0.1", done));
  origin = "http://127.0.0.1:" + app.address().port;
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--no-sandbox"],
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 360, height: 820 },
    });
    let errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const metadata = {
      id: user,
      email: "qa@example.test",
      role: "authenticated",
      aud: "authenticated",
      user_metadata: { full_name: "Riya Tester" },
      app_metadata: {},
    };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token =
      Buffer.from('{"alg":"HS256"}').toString("base64url") +
      "." +
      Buffer.from(JSON.stringify({ sub: user, exp })).toString("base64url") +
      ".fake";
    await page.addInitScript(
      ({ key, token, metadata, exp }) =>
        localStorage.setItem(
          key,
          JSON.stringify({
            access_token: token,
            refresh_token: "stub",
            expires_at: exp,
            user: metadata,
          }),
        ),
      { key, token, metadata, exp },
    );
    let draft, createdTask;
    let chatDrafts = 0;
    const messages = [];
    const snapshot = () => ({
      portalReady:true, personalReady:true, project:fixture.projects[0], members:fixture.project_members,
      requirements:fixture.requirement_items, rules:fixture.project_requirements[0], ai:fixture.project_ai_constraints[0],
      skills:fixture.user_skills, availability:fixture.member_availability, tasks:fixture.project_tasks, milestones:fixture.milestones,
      documents:[], learning:[], activity:[], invitations:[],
    });
    await page.route("https://ekqfotmlnqqrbcizjtfz.supabase.co/**", (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        table = url.pathname.split("/").at(-1);
      if (url.pathname.includes("/auth/"))
        return route.fulfill({ json: metadata });
      if (table === "portal_project_snapshot") return route.fulfill({ json: snapshot() });
      if (table === "save_project_draft") throw Error("Setup cannot write before approval");
      if (table === "approve_portal_project") {
        draft = req.postDataJSON().p_content;
        assert.equal(draft.project.name, "River Jam");
        fixture.projects[0].name = draft.project.name;
        return route.fulfill({ json: project });
      }
      if (table === "project_messages" && req.method() === "POST") {
        const row = { ...req.postDataJSON(), id:crypto.randomUUID(), author_id:user, created_at:now, resolved_at:null };
        messages.push(row);
        if (!row.bulletin_type) chatDrafts++;
        return route.fulfill({ json: {id:row.id}, status:201 });
      }
      if (table === "project_messages") return route.fulfill({ json: messages.filter(row => {
        const bulletin = url.searchParams.get("bulletin_type");
        const task = url.searchParams.get("thread_task");
        if (bulletin === "not.is.null") return Boolean(row.bulletin_type);
        return !row.bulletin_type && (task === "is.null" ? !row.thread_task : task === "eq." + row.thread_task);
      }) });
      if (table === "resolve_bulletin_post") {
        const {p_id,p_resolved} = req.postDataJSON();
        messages.find(row => row.id === p_id).resolved_at = p_resolved ? now : null;
        return route.fulfill({ json:null });
      }
      if (table === "project_tasks" && req.method() === "POST") {
        [createdTask] = req.postDataJSON();
        fixture.project_tasks.push({
          ...createdTask,
          status: "open",
          estimated_hours: 0,
        });
        return route.fulfill({ status: 201 });
      }
      if (table === "project_task_totals") return route.fulfill({ json: [] });
      if (req.method() === "PATCH") return route.fulfill({ status: 204 });
      const single = req.headers().accept?.includes("object+json");
      return route.fulfill({
        json: single ? fixture[table]?.[0] || {} : fixture[table] || [],
      });
    });
    await page.goto(origin + "/shared?project=" + project);
    const navigation = page.getByRole("navigation", {name:"Project areas"});
    await navigation.waitFor({timeout:8000}).catch(async error => { console.error(errors, await page.locator("body").innerText()); throw error; });
    for (const name of ["Today", "Rules", "Work", "Team", "Submit"]) {
      await navigation.getByRole("link", {name, exact:true}).click();
      await navigation.getByRole("link", {name, exact:true, current:"page"}).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), name + " overflow");
      if (process.env.PORTAL_SCREENSHOTS && name !== "Team") {
        const file = process.env.PORTAL_SCREENSHOTS + "/" + name.toLowerCase();
        await page.waitForFunction(() => document.querySelector("#shared-content")?.querySelector("h2"));
        await page.screenshot({path:file + "-mobile.png", fullPage:true});
        await page.setViewportSize({width:1440,height:960});
        await page.screenshot({path:file + "-desktop.png", fullPage:true});
        await page.setViewportSize({width:360,height:820});
      }
    }
    await page.goBack();
    await navigation.getByRole("link", {name:"Team", current:"page"}).waitFor();
    await page.getByLabel("Share a team update").fill("Blocked on the API contract");
    await page.getByRole("button", {name:"Post update"}).click();
    assert.equal(messages[0].bulletin_type, "blocker");
    await page.getByRole("button", {name:"Blockers", exact:true}).click();
    await page.getByRole("article").getByText("Blocked on the API contract").waitFor();
    await page.getByRole("button", {name:"Mark resolved"}).click();
    await page.getByText("No posts match.").waitFor();
    await page.getByRole("button", {name:"All", exact:true}).click();
    await page.getByText("Blocker / Help · Resolved").waitFor();
    if (process.env.PORTAL_SCREENSHOTS) {
      await page.screenshot({path:process.env.PORTAL_SCREENSHOTS + "/bulletin-mobile.png", fullPage:true});
      await page.setViewportSize({width:1440,height:960});
      await page.screenshot({path:process.env.PORTAL_SCREENSHOTS + "/bulletin-desktop.png", fullPage:true});
      await page.setViewportSize({width:360,height:820});
    }
    await page.getByRole("navigation", {name:"Team tools"}).getByRole("link", {name:"Chats"}).click();
    await page.getByText("Task threads", {exact:true}).click();
    await page.getByRole("button", {name:fixture.project_tasks[0].title}).click();
    await page.getByRole("textbox", {name:"Message", exact:true}).fill("Here is the draft");
    await page.getByRole("button", {name:"Send", exact:true}).click();
    await page.getByText("Here is the draft", {exact:true}).waitFor();
    assert.equal(chatDrafts, 1);
    assert.equal(messages.at(-1).thread_task, fixture.project_tasks[0].id);
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search commands and projects").fill("mentor");
    await page.keyboard.press("Enter");
    await page.waitForURL(/sheet=AI\+mentor/);
    await page
      .getByRole("navigation", { name: "Workspace", exact: true })
      .getByRole("link", { name: "Projects", exact: true })
      .click();
    await page.getByRole("button", { name: "Create from rulebook" }).click();
    await page
      .locator("#rulebook-text")
      .fill("Hackathon name: River Jam\nSubmission deadline: 2027-02-03");
    await page
      .getByRole("button", { name: "Find details", exact: true })
      .click();
    await page.getByText("River Jam", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Fill selected fields" }).click();
    await page.locator("#step-1[aria-current=step]").waitFor();
    assert.equal(await page.locator("#f-name").inputValue(), "River Jam");
    assert.equal(
      await page.locator("#f-submission_deadline").inputValue(),
      "2027-02-03",
    );
    assert.equal(draft, undefined);
    await page.reload();
    await page.getByRole("button", {name:"Resume", exact:true}).click();
    assert.equal(await page.locator("#f-name").inputValue(), "River Jam");
    assert.equal(draft, undefined);
    await page.getByRole("button", {name:"Create project", exact:true}).click();
    await page
      .getByRole("heading", { name: "River Jam", exact: true })
      .waitFor();
    await navigation.getByRole("link", {name:"Work", exact:true}).click();
    await page.getByRole("navigation", {name:"Work tools"}).getByRole("link", {name:"Plan", exact:true}).click();
    await page.getByRole("button", { name: "Review plan tasks" }).click();
    await page
      .locator('[name="requirement-0"]')
      .selectOption(fixture.requirement_items[0].id);
    await page.getByRole("button", { name: "Add selected tasks" }).click();
    await page.getByText("Added 1 tasks to the board.").waitFor();
    assert.equal(createdTask.title, "Ship from saved plan");
    assert.equal(createdTask.requirement_id, fixture.requirement_items[0].id);
    await navigation.getByRole("link", {name:"Rules", exact:true}).click();
    await page.getByRole("heading", { name: "Task coverage" }).waitFor();
    await page.getByText("0 of 1 linked tasks done").waitFor();
    await page
      .getByRole("navigation", { name: "Workspace", exact: true })
      .getByRole("link", { name: "Today", exact: true })
      .click();
    await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Mobile navigation, browser Back, bulletin, task thread, tab-local rulebook setup, plan and Today passed.",
    );
  } finally {
    await browser.close();
    app.close();
  }
})().catch((error) => {
  console.error(error);
  app.close();
  process.exitCode = 1;
});
