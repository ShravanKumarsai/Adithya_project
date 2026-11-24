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
      studio_intake_applied: true,
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
      priority: "high",
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
  if (url.pathname === "/api/intake") {
    const bytes = [];
    for await (const chunk of req) bytes.push(chunk);
    const form = await new Response(Buffer.concat(bytes),{headers:{"content-type":req.headers["content-type"]}}).formData();
    res.writeHead(200,{"content-type":"application/json"});
    if (form.get("mode") === "profile")
      return res.end(JSON.stringify({reply:"Your React and demo experience are in the draft.",fields:{name:"Riya Tester",hackathons:"2",roles:"Frontend lead",skills:"React",interests:"Demo lead"}}));
    assert.equal(form.get("mode"),"project");
    assert.equal(form.get("attachment").type,"application/pdf");
    return res.end(JSON.stringify({reply:"I’ve added your prototype rule and first task.",fields:{
      name:"Gemini intake test",mandatory_requirements:"Submit a prototype.",tasks:"Build the prototype",roles:"Frontend developer",
    }}));
  }
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
    let draft, createdTask, readEvent, savedProfile, editedTask, joined, passwordSet;
    let chatDrafts = 0;
    const messages = [];
    const snapshot = () => ({
      portalReady:true, personalReady:true, project:fixture.projects[0], members:fixture.project_members,
      requirements:fixture.requirement_items, rules:fixture.project_requirements[0], ai:fixture.project_ai_constraints[0],
      skills:fixture.user_skills, availability:fixture.member_availability, tasks:fixture.project_tasks, milestones:fixture.milestones,
      documents:[], learning:[], activity:[], invitations:[],
    });
    let profileReads = 0;
    const mockSupabase = (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        table = url.pathname.split("/").at(-1);
      const authUser = provider => ({...metadata,app_metadata:{provider}});
      if (table === "authorize") {
        assert.equal(url.searchParams.get("provider"),"google");
        assert.equal(url.searchParams.get("redirect_to"),origin + "/shared");
        const tokens = new URLSearchParams({access_token:token,refresh_token:"stub",expires_in:"3600",token_type:"bearer",provider_token:"fake"});
        return route.fulfill({status:302,headers:{location:origin + "/shared#" + tokens}});
      }
      if (table === "token" && url.searchParams.get("grant_type") === "password") {
        assert.equal(req.postDataJSON().email,metadata.email);
        return route.fulfill({json:{access_token:token,refresh_token:"stub",expires_in:3600,user:authUser("email")}});
      }
      if (table === "signup") {
        assert.equal(url.searchParams.get("redirect_to"),origin + "/shared");
        return route.fulfill({json:{user:authUser("email")}});
      }
      if (table === "user" && req.method() === "PUT") {
        passwordSet = req.postDataJSON().password;
        return route.fulfill({json:authUser("google")});
      }
      if (url.pathname.includes("/auth/"))
        return route.fulfill({ json: authUser("google") });
      if (table === "portal_project_snapshot") return route.fulfill({ json: snapshot() });
      if (table === "save_project_draft") throw Error("Setup cannot write before approval");
      if (table === "project_notification_feed") return route.fulfill({json:[{
        project_id:project,project_name:fixture.projects[0].name,event_id:41,event_type:"requirement_items.update",event_time:now,unread:!readEvent,
      }]});
      if (table === "mark_project_notifications_read") {
        readEvent=req.postDataJSON().p_event_id;
        return route.fulfill({json:null});
      }
      if (table === "studio_account_profiles") {
        profileReads++;
        if (req.method() === "POST") {
          savedProfile=req.postDataJSON().intake;
          return route.fulfill({status:201,body:""});
        }
        return route.fulfill({json:savedProfile ? {intake:savedProfile} : null});
      }
      if (table === "accept_member_invitation" || table === "claim_studio_join_link") {
        assert.ok(savedProfile?.name && savedProfile?.skills);
        if (table === "claim_studio_join_link") joined = true;
        return route.fulfill({json:{project_id:project,project_name:fixture.projects[0].name}});
      }
      if (table === "approve_studio_intake") {
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
      if (table === "project_tasks" && req.method() === "PATCH") {
        const row = fixture.project_tasks.find(task=>"eq."+task.id === url.searchParams.get("id"));
        editedTask=req.postDataJSON();
        Object.assign(row,editedTask);
        return route.fulfill({json:{id:row.id}});
      }
      if (req.method() === "PATCH") return route.fulfill({ status: 204 });
      const single = req.headers().accept?.includes("object+json");
      return route.fulfill({
        json: single ? fixture[table]?.[0] || {} : fixture[table] || [],
      });
    };
    await page.route("https://ekqfotmlnqqrbcizjtfz.supabase.co/**",mockSupabase);
    for (const method of ["email","google"]) {
      const visitor = await browser.newPage();
      try {
        await visitor.route("https://ekqfotmlnqqrbcizjtfz.supabase.co/**",mockSupabase);
        await visitor.goto(origin + "/");
        await visitor.getByRole("heading",{name:"Welcome to DraftDeck"}).waitFor();
        await visitor.getByRole("button",{name:"Continue with Google"}).waitFor();
        await visitor.getByRole("button",{name:"Sign in with email"}).waitFor();
        if (method === "email") {
          await visitor.getByRole("button",{name:"Create an account"}).click();
          await visitor.getByLabel("Email",{exact:true}).fill(metadata.email);
          await visitor.getByLabel("Password",{exact:true}).fill("fixture-password");
          await visitor.getByRole("button",{name:"Create account",exact:true}).click();
          await visitor.getByText("Check your email to confirm your DraftDeck account, then sign in.").waitFor();
          await visitor.getByLabel("Email",{exact:true}).fill(metadata.email);
          await visitor.getByLabel("Password",{exact:true}).fill("fixture-password");
          await visitor.getByRole("button",{name:"Sign in with email"}).click();
        } else await visitor.getByRole("button",{name:"Continue with Google"}).click();
        await visitor.getByRole("heading",{name:"Shared projects"}).waitFor();
        await visitor.getByRole("button",{name:"Open project",exact:true}).waitFor();
        assert.equal(new URL(visitor.url()).pathname,"/shared");
        assert.equal(await visitor.title(),"DraftDeck");
      } finally { await visitor.close(); }
    }
    assert.equal(profileReads,0,"Sign-in must open the dashboard before optional profile setup");
    const visitor = await browser.newPage();
    try {
      await visitor.route("https://ekqfotmlnqqrbcizjtfz.supabase.co/**",mockSupabase);
      for (const separator of ["#","?"]) {
        const details = new URLSearchParams({error:"server_error",error_code:"unexpected_failure",
          error_description:"Unable to exchange external code: example-provider-detail"});
        await visitor.goto(origin + "/shared" + separator + details);
        await visitor.getByRole("alert").filter({hasText:"Sign-in couldn’t finish"}).waitFor();
        assert.equal(visitor.url(),origin + "/shared");
        assert.equal(await visitor.getByText("example-provider-detail",{exact:false}).count(),0);
        await visitor.getByRole("button",{name:"Continue with Google"}).waitFor();
      }
      await visitor.getByRole("button",{name:"Continue with Google"}).click();
      await visitor.getByRole("heading",{name:"Shared projects"}).waitFor();
    } finally { await visitor.close(); }
    await page.goto(origin + "/shared");
    const directory = page.getByRole("heading", {name:"Shared projects"});
    await directory.waitFor();
    await page.getByRole("navigation", {name:"Workspace"}).getByRole("link", {name:"Project insights"}).waitFor();
    await page.getByRole("link", {name:"Portfolio", exact:true}).waitFor();
    await page.getByRole("button", {name:"Create from rulebook"}).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-blueprint"), "light");
    assert.equal(await page.locator(".wordmark").textContent(), "DraftDeck");
    if (process.env.PORTAL_SCREENSHOTS) {
      await page.screenshot({path:process.env.PORTAL_SCREENSHOTS + "/shared-projects-mobile.png", fullPage:true});
      await page.setViewportSize({width:1820,height:900});
      await page.screenshot({path:process.env.PORTAL_SCREENSHOTS + "/shared-projects-desktop.png", fullPage:true});
      await page.setViewportSize({width:360,height:820});
    }
    await page.getByRole("button", {name:"Open project", exact:true}).click();
    assert.equal(await page.locator("html").getAttribute("data-blueprint"), "light");
    const navigation = page.getByRole("navigation", {name:"Project areas"});
    await navigation.waitFor({timeout:8000}).catch(async error => { console.error(errors, await page.locator("body").innerText()); throw error; });
    await page.getByText("Hackathon clock",{exact:true}).waitFor();
    await page.getByText("Deadline risk",{exact:true}).waitFor();
    if (process.env.PORTAL_SCREENSHOTS) {
      await page.screenshot({path:process.env.PORTAL_SCREENSHOTS + "/overview-mobile.png",fullPage:true});
      await page.setViewportSize({width:1440,height:960});
      await page.screenshot({path:process.env.PORTAL_SCREENSHOTS + "/overview-desktop.png",fullPage:true});
      await page.setViewportSize({width:360,height:820});
    }
    await page.getByRole("button",{name:/Notifications, 1 unread/}).click();
    const alert = page.getByRole("button",{name:/Requirement updated/});
    assert.equal(await alert.getAttribute("data-read-event"),"41");
    const [readRequest] = await Promise.all([
      page.waitForRequest(request=>request.url().includes("/rpc/mark_project_notifications_read")),
      alert.click(),
    ]);
    await navigation.getByRole("link",{name:"Rules",current:"page"}).waitFor();
    assert.equal(readRequest.postDataJSON().p_event_id,41);
    await navigation.getByRole("link",{name:"Work",exact:true}).click();
    await navigation.getByRole("link",{name:"Work",current:"page"}).waitFor();
    const workTools=page.getByRole("navigation",{name:"Work tools"});
    await workTools.getByRole("link",{name:"Timeline",exact:true}).click();
    await page.waitForURL(/sheet=Timeline/);
    await workTools.getByRole("link",{name:"Board",exact:true}).click();
    await page.getByLabel("Search tasks").fill("Build a card");
    assert.equal(await page.locator('.bp-card[data-id="30000000-0000-4000-8000-000000000002"]').isVisible(),false);
    const firstTask=page.locator('.bp-card[data-id="30000000-0000-4000-8000-000000000001"]');
    await firstTask.getByText("Task options",{exact:true}).click();
    const policy = fixture.project_ai_constraints[0];
    policy.external_ai_apis_allowed = true;
    policy.gemini_planning_allowed = true;
    await page.route("**/api/ai/task.mentor", route => {
      assert.equal(route.request().postDataJSON().input.selectedTask,fixture.project_tasks[0].id);
      return route.fulfill({json:{data:{action:"edit",taskId:fixture.project_tasks[0].id,
        title:"",priority:"urgent",status:"",reason:"Make delivery the first priority."}}});
    });
    await firstTask.getByRole("button",{name:"Ask mentor",exact:true}).click();
    await page.waitForURL(/task=30000000-0000-4000-8000-000000000001/);
    assert.match(await page.getByLabel("Question",{exact:true}).inputValue(),/Build a card/);
    await page.getByLabel("Question",{exact:true}).fill("Set this task to urgent.");
    await page.getByRole("button",{name:"Propose task change"}).click();
    const mentorReview=page.getByRole("dialog",{name:"Review task change"});
    await mentorReview.waitFor();
    assert.equal(editedTask,undefined);
    policy.external_ai_apis_allowed = false;
    policy.gemini_planning_allowed = false;
    await mentorReview.getByRole("button",{name:"Approve task change"}).click();
    await mentorReview.waitFor({state:"hidden"});
    assert.equal(editedTask.priority,"urgent");
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
    await page.getByRole("textbox", {name:"Message", exact:true}).fill("We agreed to use the web demo.");
    await page.getByRole("button", {name:"Send", exact:true}).click();
    await page.getByText("We agreed to use the web demo.", {exact:true}).waitFor();
    await page.locator('.studio-composer summary[aria-label="Message actions"]').click();
    await page.getByText("Conversation tools",{exact:true}).click();
    await page.getByRole("button",{name:"Extract decisions",exact:true}).click();
    const draftPanel = page.locator("#portal-thread-draft");
    await draftPanel.getByRole("heading",{name:"Proposed decisions · Quoted draft"}).waitFor();
    assert.equal(chatDrafts,2);
    await draftPanel.getByRole("button",{name:"Accept",exact:true}).click();
    await draftPanel.getByText("Approved and saved.",{exact:true}).waitFor();
    assert.equal(chatDrafts,3);
    await page.keyboard.press("Control+k");
    await page.getByLabel("Search commands and projects").fill("mentor");
    await page.keyboard.press("Enter");
    await page.waitForURL(/sheet=AI\+mentor/);
    await page
      .getByRole("navigation", { name: "Workspace", exact: true })
      .getByRole("link", { name: "Shared projects", exact: true })
      .click();
    await page.getByRole("button",{name:"Create project",exact:true}).click();
    await page.getByRole("heading",{name:"Set up your profile"}).waitFor();
    await page.getByLabel("Number of past hackathons",{exact:true}).fill("0");
    await page.getByRole("button",{name:"Python",exact:true}).click();
    assert.equal(await page.getByLabel("Skills",{exact:true}).inputValue(),"Python");
    assert.equal(draft,undefined);
    await page.getByRole("button",{name:"Save profile",exact:true}).click();
    await page.getByRole("heading",{name:"Project setup"}).waitFor();
    assert.equal(savedProfile.hackathons,"0");
    await page.getByLabel("Message Gemini").fill("Read this rulebook and help me plan the project.");
    await page.getByLabel("Attach PDFs or images").setInputFiles({name:"rules.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF fixture")});
    await page.getByRole("button",{name:"Send",exact:true}).click();
    await page.getByText("I’ve added your prototype rule and first task.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Review details",exact:true}).click();
    assert.equal(await page.locator("#f-name").inputValue(),"Gemini intake test");
    assert.equal(await page.locator('[name="mandatory_requirements"]').inputValue(),"Submit a prototype.");
    assert.equal(await page.locator('[name="tasks"]').inputValue(),"Build the prototype");
    await page.getByRole("button",{name:"Cancel setup"}).click();
    assert.equal(draft,undefined);
    await page.getByRole("button", { name: "Create from rulebook" }).click();
    await page
      .locator("#rulebook-text")
      .fill("Hackathon name: River Jam\nSubmission deadline: 2027-02-03");
    await page
      .getByRole("button", { name: "Find details", exact: true })
      .click();
    await page.locator("#rulebook-review q").filter({ hasText: /^River Jam$/ }).waitFor();
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
      .getByRole("link", { name: "Project insights", exact: true })
      .click();
    await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
    await page.getByRole("navigation",{name:"Workspace",exact:true}).getByRole("link",{name:"My profile",exact:true}).click();
    await page.getByRole("heading",{name:"Set up your profile"}).waitFor();
    await page.getByRole("button",{name:"Interview with Gemini"}).click();
    await page.getByLabel("Message Gemini").fill("I used React to build our demo. I’d like to lead demos.");
    await page.getByRole("button",{name:"Send",exact:true}).click();
    await page.getByText("Your React and demo experience are in the draft.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Review details",exact:true}).click();
    assert.equal(await page.getByLabel("Skills",{exact:true}).inputValue(),"React");
    assert.equal(savedProfile.skills,"Python");
    await page.getByRole("button",{name:"Save profile",exact:true}).click();
    await directory.waitFor();
    assert.equal(savedProfile.interests,"Demo lead");
    savedProfile = undefined;
    await page.goto(origin + "/shared#invite=" + "a".repeat(64));
    await page.getByRole("heading",{name:"Set up your profile"}).waitFor();
    await page.getByRole("button",{name:"Interview with Gemini"}).click();
    await page.getByLabel("Message Gemini").fill("I’m Riya. Two hackathons as frontend lead. I use React.");
    await page.getByRole("button",{name:"Send",exact:true}).click();
    await page.getByText("Your React and demo experience are in the draft.",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Review details",exact:true}).click();
    assert.equal(await page.getByLabel("Number of past hackathons",{exact:true}).inputValue(),"2");
    assert.equal(joined,undefined);
    await page.getByRole("button",{name:"Save profile",exact:true}).click();
    await page.getByRole("button",{name:"Join project",exact:true}).click();
    await page.waitForURL(/sheet=Team/);
    assert.equal(joined,true);
    await page.getByRole("navigation",{name:"Workspace",exact:true}).getByRole("link",{name:"Settings",exact:true}).click();
    await page.getByLabel("Theme",{exact:true}).selectOption("graphite");
    assert.equal(await page.locator("html").getAttribute("data-blueprint"),"graphite");
    await page.reload();
    await page.getByRole("heading",{name:"Sign-in methods"}).waitFor();
    assert.equal(await page.locator("html").getAttribute("data-blueprint"),"graphite");
    await page.getByRole("button",{name:"Set or change password",exact:true}).click();
    await page.getByLabel("New password",{exact:true}).fill("same-account-test-password");
    await page.getByLabel("Confirm password",{exact:true}).fill("same-account-test-password");
    await page.getByRole("button",{name:"Save password",exact:true}).click();
    await page.getByText("Password saved. You can now sign in with this email and password.").waitFor();
    assert.equal(passwordSet,"same-account-test-password");
    assert.deepEqual(errors, []);
    console.log(
      "Mobile navigation, notification routing, task mentor, Gemini attachment and profile review, bulletin, task thread, rulebook setup, plan and Today passed.",
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
