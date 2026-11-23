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
      viewport: { width: 375, height: 820 },
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
    await page.route("https://ekqfotmlnqqrbcizjtfz.supabase.co/**", (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        table = url.pathname.split("/").at(-1);
      if (url.pathname.includes("/auth/"))
        return route.fulfill({ json: metadata });
      if (table === "save_project_draft") {
        draft = req.postDataJSON().p_content;
        return route.fulfill({ json: { revision: 1 } });
      }
      if (table === "publish_project_draft") {
        assert.equal(draft.project.name, "River Jam");
        fixture.projects[0].name = draft.project.name;
        return route.fulfill({ json: project });
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
    await page
      .locator("#area-Overview")
      .waitFor({ timeout: 7000 })
      .catch(async (error) => {
        console.error(errors, await page.locator("body").innerText());
        throw error;
      });

    for (const group of ["Overview", "Plan", "Team", "Work", "Activity"]) {
      await page.locator("#area-" + group).click();
      const sections = await page
        .getByRole("tablist", { name: group + " sections" })
        .getByRole("tab")
        .evaluateAll((tabs) => tabs.map((tab) => tab.id));
      for (const id of sections) {
        await page.locator("#" + id).click();
        assert.equal(
          await page.locator("#shared-content").getAttribute("aria-labelledby"),
          id,
        );
        assert.ok(
          (await page.evaluate(() => document.documentElement.scrollWidth)) <=
            375,
          group + " " + id + " overflow",
        );
      }
    }
    await page.locator("#area-Overview").focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => document.activeElement.id === "area-Plan");
    assert.equal(
      await page.locator("#area-Plan").getAttribute("aria-selected"),
      "true",
    );
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search commands and projects").fill("mentor");
    await page.keyboard.press("Enter");
    await page.locator("#tab-Mentor[aria-selected=true]").waitFor();
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
    await page
      .getByRole("button", { name: "Create project", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "River Jam", exact: true })
      .waitFor();
    await page.locator("#area-Plan").click();
    await page.locator("#tab-AI-plan").click();
    await page.getByRole("button", { name: "Review plan tasks" }).click();
    await page
      .locator('[name="requirement-0"]')
      .selectOption(fixture.requirement_items[0].id);
    await page.getByRole("button", { name: "Add selected tasks" }).click();
    await page.getByText("Added 1 tasks to the board.").waitFor();
    assert.equal(createdTask.title, "Ship from saved plan");
    assert.equal(createdTask.requirement_id, fixture.requirement_items[0].id);
    await page.locator("#tab-Setup").click();
    await page.getByRole("heading", { name: "Task coverage" }).waitFor();
    await page.getByText("0 of 1 linked tasks done").waitFor();
    await page
      .getByRole("navigation", { name: "Workspace", exact: true })
      .getByRole("link", { name: "Today", exact: true })
      .click();
    await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "Mobile project navigation, linked tabs, keyboard commands, rulebook preview and Today passed.",
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
