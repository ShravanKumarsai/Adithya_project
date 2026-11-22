const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const button = (action, label) =>
  '<button type="button" class="button subtle" data-v3="' +
  escape(action) +
  '">' +
  escape(label) +
  "</button>";
const panel = (title, body) =>
  '<section class="bp-panel"><h2>' +
  escape(title) +
  "</h2>" +
  body +
  "</section>";
const field = (id, label, value = "", type = "text", attrs = "") =>
  "<label>" +
  escape(label) +
  (type === "textarea"
    ? '<textarea name="' +
      id +
      '" ' +
      attrs +
      ">" +
      escape(value) +
      "</textarea>"
    : '<input name="' +
      id +
      '" type="' +
      type +
      '" value="' +
      escape(value) +
      '" ' +
      attrs +
      ">") +
  "</label>";
const select = (id, label, options, current = "") =>
  "<label>" +
  escape(label) +
  '<select name="' +
  id +
  '">' +
  options
    .map(
      ([value, name]) =>
        '<option value="' +
        escape(value) +
        '" ' +
        (value === current ? "selected" : "") +
        ">" +
        escape(name) +
        "</option>",
    )
    .join("") +
  "</select></label>";
const yes = (id, label, value) =>
  '<label class="v3-check"><input type="checkbox" name="' +
  id +
  '" ' +
  (value ? "checked" : "") +
  "> " +
  escape(label) +
  "</label>";
const list = (items) =>
  "<ul>" +
  items.map((item) => "<li>" + escape(item) + "</li>").join("") +
  "</ul>";
const when = (value) => new Date(value).toLocaleString();
const activeUsed = (account, now = Date.now()) =>
  Date.parse(account.reset_at) <= now ? 0 : account.used;
const available = (account) =>
  Math.max(0, account.allowance - activeUsed(account));
const rank = { beginner: 1, intermediate: 3, advanced: 4, expert: 5 };

export function mountPersonalStudio(ctx) {
  const {
    project,
    data,
    db,
    result,
    rpc,
    session,
    leader,
    tab,
    modal,
    refresh,
    notify,
    openSheet,
    aiJSON,
    draft,
    studioSkills,
    editConnections,
    editPolicy,
    editProfile,
  } = ctx;
  const root = document.querySelector("#shared-content");
  const user = session.user.id,
    id = project.id;
  const name = (uid) =>
    data.members.find((m) => m.user_id === uid)?.full_name || "Teammate";
  const accepted = data.members.filter(
    (m) => m.user_id && m.status === "accepted",
  );
  const others = accepted.filter((m) => m.user_id !== user);
  const myTasks = data.tasks.filter(
    (t) => t.owner_id === user && t.status !== "done",
  );
  const skills = [["", "General"], ...studioSkills.map((s) => [s, s])];
  let channel,
    timer,
    selected,
    details,
    threads = [],
    markers = [],
    credits = [],
    messages = [];
  function add(html) {
    root.insertAdjacentHTML("beforeend", html);
  }
  function bind(action, fn, node = root) {
    node.querySelectorAll('[data-v3="' + CSS.escape(action) + '"]').forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await fn(b);
          } catch (error) {
            notify(error.message);
          } finally {
            b.disabled = false;
          }
        }),
    );
  }
  const form = (title, html, save, after = refresh) =>
    modal(title, html, save, after);
  const addRow = (table, values) => result(db.from(table).insert(values));
  function saveDetails(values) {
    return result(
      db
        .from("studio_member_details")
        .upsert(
          { project_id: id, user_id: user, ...values },
          { onConflict: "project_id,user_id" },
        ),
    );
  }
  async function loadThreads() {
    [threads, markers] = await Promise.all([
      result(
        db
          .from("studio_threads")
          .select("*")
          .eq("project_id", id)
          .order("created_at", { ascending: false }),
      ),
      result(
        db.from("studio_thread_members").select("thread_id,user_id,last_read"),
      ),
    ]);
  }
  async function loadCredits() {
    credits = await result(
      db
        .from("studio_ai_accounts")
        .select("*")
        .eq("project_id", id)
        .order("tool"),
    );
  }
  async function loadDetails() {
    details =
      (await result(
        db
          .from("studio_member_details")
          .select("*")
          .eq("project_id", id)
          .eq("user_id", user)
          .maybeSingle(),
      )) || {};
  }
  const unread = (thread) =>
    markers.find((m) => m.thread_id === thread.id && m.user_id === user)
      ?.last_read || "-infinity";
  const help = () =>
    threads.filter((t) => t.skill && !t.resolved && t.creator_id !== user);
  function helper(skill, prompt = "") {
    const score = (member) => {
      const matches = data.skills.filter((s) => s.user_id === member.user_id);
      const verified = Math.max(
        0,
        ...matches
          .filter((s) => s.skill_name.toLowerCase() === skill.toLowerCase())
          .map((s) => rank[s.verified_level] || 0),
      );
      const textMatch = matches.filter((s) =>
        prompt.toLowerCase().includes(s.skill_name.toLowerCase()),
      ).length;
      const workload = data.tasks
        .filter((t) => t.owner_id === member.user_id && t.status !== "done")
        .reduce((sum, t) => sum + Number(t.estimated_hours), 0);
      return (
        verified * 5 +
        textMatch * 2 -
        workload /
          Math.max(
            1,
            Number(
              data.availability.find((a) => a.user_id === member.user_id)
                ?.weekly_hours || 8,
            ),
          )
      );
    };
    return [...others].sort((a, b) => score(b) - score(a))[0];
  }
  function editDetails() {
    const numeric = 'min="0" max="5" step="1"';
    form(
      "Edit project profile",
      field(
        "expertise",
        "Expertise and interests",
        details.expertise,
        "textarea",
        'maxlength="1800"',
      ) +
        field(
          "history",
          "Past roles, hackathons or resume excerpt",
          details.history,
          "textarea",
          'maxlength="2500"',
        ) +
        field(
          "past_hours",
          "Hours per week in past hackathons",
          details.past_hours || 0,
          "number",
          'min="0" max="168"',
        ) +
        field("github_login", "GitHub username", details.github_login) +
        "<fieldset><legend>Self-assessed skills · 0–5</legend>" +
        studioSkills
          .map((s, i) =>
            field(
              "rating_" + i,
              s,
              details.ratings?.[s] ?? 0,
              "number",
              numeric,
            ),
          )
          .join("") +
        "</fieldset>",
      async (values) =>
        saveDetails({
          expertise: values.get("expertise").trim(),
          history: values.get("history").trim(),
          past_hours: Number(values.get("past_hours")),
          github_login: values.get("github_login").trim(),
          ratings: Object.fromEntries(
            studioSkills.map((s, i) => [s, Number(values.get("rating_" + i))]),
          ),
        }),
    );
  }
  function roleFallback() {
    const order = [...studioSkills].sort(
      (a, b) => (details.ratings?.[b] || 0) - (details.ratings?.[a] || 0),
    );
    const assigned = myTasks.map((t) => t.skill).filter(Boolean);
    return {
      role: assigned[0] || "Project contributor",
      areas: [
        ...new Set([
          ...assigned,
          ...order.filter((s) => details.ratings?.[s] > 0),
        ]),
      ].slice(0, 3),
      why: assigned.length
        ? "Based on the work currently assigned to you."
        : "Based on your profile. Review it with the project lead.",
    };
  }
  async function dashboard() {
    await Promise.all([loadDetails(), loadCredits(), loadThreads()]);
    if (!root.isConnected) return;
    const role = details.role_draft || {};
    const hours = myTasks.reduce(
      (total, t) => total + Number(t.estimated_hours),
      0,
    );
    const days = project.submission_deadline
      ? Math.max(
          0,
          (new Date(project.submission_deadline + "T23:59:59") - Date.now()) /
            86400000,
        )
      : null;
    const weekly = Number(
      data.availability.find((a) => a.user_id === user)?.weekly_hours || 0,
    );
    const capacity =
      days === null ? null : Math.round(((days * weekly) / 7) * 10) / 10;
    const milestone = data.milestones.find((m) => !m.done);
    add(
      '<div class="bp-grid">' +
        panel(
          "My role",
          '<strong class="v3-lead">' +
            escape(role.role || "Choose your role") +
            "</strong><p>" +
            escape(
              role.why ||
                "Complete your profile and draft a role for this project.",
            ) +
            "</p>" +
            list(role.areas || []) +
            button("role", "Analyse my role") +
            button("skills", "Suggest skill ratings") +
            button("profile", "Edit project profile") +
            button("availability", "Edit availability"),
        ) +
        panel(
          "My workload",
          '<strong class="v3-lead">' +
            hours +
            " h</strong><p>" +
            escape(
              capacity === null
                ? "Set a project deadline"
                : capacity +
                    " h available before deadline · " +
                    (hours > capacity ? "Over capacity" : "Within capacity"),
            ) +
            "</p>" +
            list(
              myTasks.map(
                (t) => t.title + (t.due_date ? " · Due " + t.due_date : ""),
              ),
            ) +
            button("board", "Open board"),
        ) +
        panel(
          "Next milestone",
          milestone
            ? "<strong>" +
                escape(milestone.name) +
                "</strong><p>" +
                escape(milestone.due) +
                "</p>"
            : "<p>No upcoming milestone.</p>",
        ) +
        panel(
          "Help requests",
          '<div id="v3-help"></div>' + button("help", "Open direct chats"),
        ) +
        panel(
          "My AI credits",
          '<div id="v3-own-credits"></div>' +
            button("credits", "Manage AI accounts"),
        ) +
        panel("Plan my day", button("my-day", "Draft priorities")) +
        "</div>",
    );
    redrawHelp();
    const own = root.querySelector("#v3-own-credits");
    const renderOwn = () => {
      own.innerHTML =
        credits
          .filter((c) => c.user_id === user)
          .map(
            (c) =>
              "<p>" +
              escape(c.tool) +
              " · " +
              available(c) +
              " " +
              escape(c.unit.toLowerCase()) +
              " left " +
              (details.credit_alerts !== false &&
              available(c) / c.allowance <= 0.15
                ? "· Near limit "
                : "") +
              (c.reset_at && Date.parse(c.reset_at) > Date.now()
                ? "· " + escape(when(c.reset_at))
                : "") +
              "</p>",
          )
          .join("") || "Add a personal AI account in Settings.";
    };
    renderOwn();
    timer = setInterval(renderOwn, 1000);
    bind("profile", editDetails);
    bind("availability", editProfile);
    bind("day", () => openSheet("My dashboard"));
    bind("board", () => openSheet("Board"));
    bind("help", () => openSheet("Direct chats"));
    bind("credits", () => openSheet("AI credits"));
    bind("role", async () =>
      draft(
        "role.analysis",
        await aiJSON("role.analysis", {}, roleFallback),
        (x) => saveDetails({ role_draft: x }),
        "Save role",
      ),
    );
    bind("skills", async () =>
      draft(
        "skills.normalize",
        await aiJSON("skills.normalize", {}, () => ({
          ratings: studioSkills.map((s) => ({
            skill: s,
            level: details.ratings?.[s] || 0,
          })),
        })),
        (x) =>
          saveDetails({
            ratings: Object.fromEntries(
              x.ratings.map((s) => [
                s.skill,
                Math.min(5, Math.max(0, s.level)),
              ]),
            ),
          }),
        "Save suggested ratings",
      ),
    );
    bind("my-day", async () =>
      draft(
        "personal.day",
        await aiJSON("personal.day", {}, () => ({
          items: [
            myTasks.length
              ? "Start with " + myTasks[0].title
              : "Check the board for work to pick up.",
            help().length
              ? "Respond to " + help().length + " open help requests."
              : "Review the team's current blockers.",
            milestone
              ? "Prepare for " + milestone.name + " on " + milestone.due
              : "Review your capacity before taking new work.",
          ],
        })),
      ),
    );
  }
  function redrawHelp() {
    const slot = root.querySelector("#v3-help");
    if (slot)
      slot.innerHTML =
        (details?.help_alerts === false
          ? ""
          : list(help().map((t) => t.topic + " · " + t.skill))) ||
        "No open help requests.";
  }
  function accountEditor(account) {
    const used = account ? activeUsed(account) : 0;
    form(
      account ? "Edit AI account" : "Add AI account",
      select(
        "tool",
        "Tool",
        ["ChatGPT", "Claude", "Gemini", "Copilot", "Other"].map((x) => [x, x]),
        account?.tool,
      ) +
        field(
          "handle",
          "Account label",
          account?.handle,
          "text",
          'maxlength="80"',
        ) +
        select(
          "unit",
          "Unit",
          ["Messages", "Requests", "Tokens"].map((x) => [x, x]),
          account?.unit,
        ) +
        field(
          "allowance",
          "Allowance",
          account?.allowance ?? 30,
          "number",
          'min="1" required',
        ) +
        field(
          "used",
          "Used in current window",
          used,
          "number",
          'min="0" required',
        ) +
        field(
          "window_hours",
          "Window length in hours",
          account?.window_hours ?? 4,
          "number",
          'min="0.25" max="720" step="0.01" required',
        ) +
        yes(
          "shared",
          "Share this account and its label with teammates",
          account?.shared,
        ) +
        (account ? yes("restart", "Start a new usage window", false) : ""),
      async (values) => {
        const window = Number(values.get("window_hours"));
        const reset =
          !account ||
          values.has("restart") ||
          Date.parse(account.reset_at) <= Date.now();
        const row = {
          project_id: id,
          user_id: user,
          tool: values.get("tool"),
          handle: values.get("handle").trim(),
          unit: values.get("unit"),
          allowance: Number(values.get("allowance")),
          used: Number(values.get("used")),
          window_hours: window,
          reset_at: reset
            ? new Date(Date.now() + window * 3600000).toISOString()
            : account.reset_at,
          shared: values.has("shared"),
        };
        return account
          ? result(
              db.from("studio_ai_accounts").update(row).eq("id", account.id),
            )
          : addRow("studio_ai_accounts", row);
      },
    );
  }
  function creditRows(target, ownOnly = false) {
    const now = Date.now();
    const rows = credits.filter((c) => !ownOnly || c.user_id === user);
    target.innerHTML =
      rows
        .map((c) => {
          const left = available(c),
            seconds = Math.max(
              0,
              Math.ceil((Date.parse(c.reset_at) - now) / 1000),
            );
          return (
            '<article class="bp-card"><strong>' +
            escape(c.tool + (c.handle ? " · " + c.handle : "")) +
            "</strong><p>" +
            escape(name(c.user_id)) +
            " · " +
            left +
            " / " +
            c.allowance +
            " " +
            escape(c.unit.toLowerCase()) +
            ' remaining</p><progress max="' +
            c.allowance +
            '" value="' +
            Math.min(c.allowance, activeUsed(c)) +
            '" aria-label="' +
            escape(c.tool) +
            ' usage"></progress><p>' +
            escape(
              seconds
                ? (seconds >= 3600 ? Math.floor(seconds / 3600) + "h " : "") +
                    Math.floor((seconds % 3600) / 60) +
                    "m " +
                    (seconds % 60) +
                    "s until refresh"
                : "Window refreshed. Update usage to start a new window.",
            ) +
            (c.user_id === user
              ? " · " + (c.shared ? "Shared" : "Private")
              : "") +
            "</p>" +
            (c.user_id === user
              ? button("edit-credit-" + c.id, "Edit usage") +
                button("remove-credit-" + c.id, "Remove account")
              : "") +
            "</article>"
          );
        })
        .join("") || "<p>No visible AI accounts.</p>";
    for (const c of rows.filter((c) => c.user_id === user)) {
      bind("edit-credit-" + c.id, () => accountEditor(c), target);
      bind(
        "remove-credit-" + c.id,
        () =>
          form(
            "Remove " + c.tool,
            "<p>Remove this account from the project credit tracker.</p>",
            () => result(db.from("studio_ai_accounts").delete().eq("id", c.id)),
          ),
        target,
      );
    }
  }
  function creditSummary() {
    const ordered = [...credits].sort(
      (a, b) => available(b) / b.allowance - available(a) / a.allowance,
    );
    const low = ordered.filter((c) => available(c) / c.allowance <= 0.15);
    const next = ordered
      .filter((c) => Date.parse(c.reset_at) > Date.now())
      .sort((a, b) => Date.parse(a.reset_at) - Date.parse(b.reset_at))[0];
    return (
      "<p>" +
      escape(
        ordered[0]
          ? "Most headroom · " +
              name(ordered[0].user_id) +
              " on " +
              ordered[0].tool
          : "No entries yet.",
      ) +
      "</p>" +
      "<p>" +
      escape(
        low.length
          ? low.length + " accounts near their limit"
          : "No accounts near limit",
      ) +
      "</p><p>" +
      escape(
        next ? "Next refresh · " + when(next.reset_at) : "No refresh pending.",
      ) +
      "</p>"
    );
  }
  async function showCredits(own = false) {
    await loadCredits();
    if (!root.isConnected) return;
    add(
      panel(
        own ? "Personal AI accounts" : "AI credits",
        "<p>Manually tracked usage. Share only the accounts you choose.</p>" +
          button("account", "Add AI account") +
          '<div id="v3-credit-summary"></div><div id="v3-credit-rows"></div>',
      ),
    );
    const rows = root.querySelector("#v3-credit-rows");
    const draw = () => {
      if (rows.contains(document.activeElement)) return;
      root.querySelector("#v3-credit-summary").innerHTML = own
        ? ""
        : creditSummary();
      creditRows(rows, own);
    };
    draw();
    timer = setInterval(draw, 1000);
    bind("account", () => accountEditor());
  }
  function createThread() {
    if (!others.length)
      throw Error("Invite a teammate before starting a direct chat.");
    const people = others
      .map(
        (m) =>
          '<label class="v3-check"><input name="participants" type="checkbox" value="' +
          m.user_id +
          '"> ' +
          escape(m.full_name) +
          "</label>",
      )
      .join("");
    form(
      "Start direct chat",
      field("topic", "Topic", "", "text", 'required maxlength="150"') +
        select("skill", "Skill or help request", skills) +
        field("body", "Opening message", "", "textarea", 'maxlength="6000"') +
        button("choose-helper", "Find a helper") +
        button("draft-help", "Draft opening message") +
        '<p id="v3-helper-out" aria-live="polite"></p><fieldset><legend>Participants</legend>' +
        people +
        "</fieldset>",
      async (values) => {
        selected = await rpc("start_studio_thread", {
          p_project: id,
          p_topic: values.get("topic"),
          p_skill: values.get("skill"),
          p_users: values.getAll("participants"),
          p_body: values.get("body"),
        });
      },
      async () => {
        await loadThreads();
        drawThreads();
        await openThread(selected);
      },
    );
    const dialog = document.querySelector("#shared-dialog");
    const value = (k) =>
      dialog.querySelector('[name="' + k + '"]')?.value || "";
    bind(
      "choose-helper",
      () => {
        const preferred = helper(
          value("skill"),
          value("body") + " " + value("topic"),
        );
        if (preferred) {
          dialog.querySelector('[value="' + preferred.user_id + '"]').checked =
            true;
          dialog.querySelector("#v3-helper-out").textContent =
            "Suggested helper: " +
            preferred.full_name +
            " based on skill and current workload.";
        }
      },
      dialog,
    );
    bind(
      "draft-help",
      async () => {
        const question = value("body") || value("topic");
        if (!question) throw Error("Enter a topic first.");
        const output = await aiJSON("help.draft", { question }, () => ({
          text:
            "Could you help with " +
            question +
            "? I can share what I tried and where I got stuck.",
        }));
        if (!dialog.open) return;
        dialog.querySelector("[name=body]").value = output.data.text;
        dialog.querySelector("#v3-helper-out").textContent = output.ai
          ? "Gemini draft · Review before sending."
          : "Basic draft · Review before sending.";
      },
      dialog,
    );
  }
  async function chats() {
    add(
      '<div class="v3-inbox">' +
        panel(
          "Direct chats",
          button("new-conversation", "Start direct chat") +
            '<div id="v3-thread-list"></div>',
        ) +
        panel(
          "Conversation",
          '<div id="v3-conversation"><p>Choose a thread or start a help request.</p></div>',
        ) +
        "</div>",
    );
    bind("new-conversation", createThread);
    await loadThreads();
    if (root.isConnected) drawThreads();
  }
  async function drawThreads() {
    const box = root.querySelector("#v3-thread-list");
    if (!box) return;
    const ids = threads.map((t) => t.id);
    const latest = ids.length
      ? await result(
          db
            .from("studio_thread_messages")
            .select("thread_id,created_at,author_id")
            .in("thread_id", ids)
            .order("created_at", { ascending: false })
            .limit(250),
        )
      : [];
    if (!box.isConnected) return;
    box.innerHTML =
      threads
        .map((t) => {
          const count = latest.filter(
            (m) =>
              m.thread_id === t.id &&
              m.author_id !== user &&
              (unread(t) === "-infinity" || m.created_at > unread(t)),
          ).length;
          return button(
            "open-" + t.id,
            t.topic +
              (t.skill ? " · " + t.skill : "") +
              (t.resolved ? " · Closed" : "") +
              (count ? " · " + count + " unread" : ""),
          );
        })
        .join("") || "No conversations.";
    for (const t of threads) bind("open-" + t.id, () => openThread(t.id));
  }
  async function openThread(threadId) {
    selected = threadId;
    const thread = threads.find((t) => t.id === threadId);
    const box = root.querySelector("#v3-conversation");
    if (!thread || !box) return;
    box.innerHTML =
      "<h3>" +
      escape(thread.topic) +
      "</h3><p>" +
      escape(
        markers
          .filter((m) => m.thread_id === threadId)
          .map((m) => name(m.user_id))
          .join(", "),
      ) +
      '</p><div id="v3-direct-log" role="log" aria-live="polite"></div>' +
      field("direct_message", "Message", "", "textarea", 'maxlength="6000"') +
      button("send-direct", "Send reply") +
      button("summarize-direct", "Summarize this private thread") +
      (thread.creator_id === user
        ? button(
            "resolve-direct",
            thread.resolved ? "Reopen help request" : "Resolve help request",
          )
        : "");
    bind(
      "send-direct",
      async () => {
        const input = box.querySelector("[name=direct_message]");
        const body = input.value.trim();
        if (!body) throw Error("Write a message.");
        await addRow("studio_thread_messages", { thread_id: threadId, body });
        input.value = "";
        await loadMessages(threadId);
      },
      box,
    );
    bind(
      "summarize-direct",
      () =>
        form(
          "Summarize private thread",
          yes(
            "consent",
            "Send up to 40 recent messages in this thread to Gemini",
            false,
          ),
          async (f) => {
            if (!f.has("consent"))
              throw Error("Check the sharing option to continue.");
          },
          async () => {
            const response = await aiJSON(
              "direct.summary",
              { threadId },
              () => ({
                summary: messages.length + " recent messages.",
                decisions: [],
                open: messages
                  .filter((m) => m.body.includes("?"))
                  .slice(-5)
                  .map((m) => m.body),
              }),
            );
            draft("direct.summary", response);
          },
        ),
      box,
    );
    bind(
      "resolve-direct",
      async () => {
        await result(
          db
            .from("studio_threads")
            .update({ resolved: !thread.resolved })
            .eq("id", threadId),
        );
        await loadThreads();
        await drawThreads();
        await openThread(threadId);
      },
      box,
    );
    await loadMessages(threadId);
  }
  async function loadMessages(threadId) {
    const rows = await result(
      db
        .from("studio_thread_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(100),
    );
    const log = root.querySelector("#v3-direct-log");
    if (!log || selected !== threadId) return;
    messages = rows.reverse();
    log.innerHTML =
      messages
        .map(
          (m) =>
            '<article class="bp-card"><small>' +
            escape(name(m.author_id)) +
            " · " +
            escape(when(m.created_at)) +
            "</small><p>" +
            escape(m.body) +
            "</p></article>",
        )
        .join("") || "<p>No replies yet.</p>";
    const last = messages.at(-1);
    if (last) {
      await result(
        db
          .from("studio_thread_members")
          .update({ last_read: last.created_at })
          .eq("thread_id", threadId)
          .eq("user_id", user)
          .lt("last_read", last.created_at),
      );
      const marker = markers.find(
        (m) => m.thread_id === threadId && m.user_id === user,
      );
      if (marker) marker.last_read = last.created_at;
    }
    await drawThreads();
  }
  const endpoint = {
    Gemini: "/api/planning/key",
    GitHub: "/api/github/token",
    Vercel: "/api/vercel/token",
  };
  async function connection(tool, method = "GET", key, check = false) {
    const response = await fetch(
      endpoint[tool] + "?projectId=" + id + (check ? "&test=1" : ""),
      {
        method,
        headers: {
          authorization: "Bearer " + session.access_token,
          "content-type": "application/json",
        },
        body: key ? JSON.stringify({ key }) : undefined,
      },
    );
    const status = await response.json();
    if (!response.ok)
      throw Error(status.error || "Could not open integration.");
    return status;
  }
  async function settings() {
    await loadDetails();
    if (!root.isConnected) return;
    add(
      panel(
        "Personal preferences",
        button("profile", "Edit project profile") +
          button("availability", "Edit availability") +
          button("alerts", "Edit notification preferences"),
      ) +
        (leader
          ? panel(
              "Team connections",
              "<p>Gemini is the active provider. Team keys stay encrypted on the server.</p>" +
                button("repository", "Edit repository and deployment") +
                button("policy", "Edit AI policy") +
                '<div id="v3-connectors"></div>' +
                button("handover", "Transfer leadership"),
            )
          : ""),
    );
    bind("profile", editDetails);
    bind("availability", editProfile);
    bind("alerts", () =>
      form(
        "Notification preferences",
        yes(
          "help",
          "Show incoming help requests",
          details.help_alerts ?? true,
        ) +
          yes(
            "credits",
            "Show AI credit refresh and low-balance alerts",
            details.credit_alerts ?? true,
          ),
        (values) =>
          saveDetails({
            help_alerts: values.has("help"),
            credit_alerts: values.has("credits"),
          }),
      ),
    );
    if (leader) {
      bind("repository", editConnections);
      bind("policy", editPolicy);
      bind("handover", () =>
        form(
          "Transfer leadership",
          select(
            "next",
            "New project leader",
            others.map((m) => [m.user_id, m.full_name]),
          ) +
            yes(
              "confirm",
              "Give this teammate control of project settings and encrypted connections",
              false,
            ),
          async (values) => {
            if (!values.has("confirm"))
              throw Error("Confirm leadership transfer.");
            await rpc("transfer_studio_lead", {
              p_project: id,
              p_member: values.get("next"),
            });
          },
        ),
      );
      const items = await Promise.all(
        Object.keys(endpoint).map(async (tool) => [
          tool,
          await connection(tool).catch(() => null),
        ]),
      );
      if (!root.isConnected) return;
      root.querySelector("#v3-connectors").innerHTML = items
        .map(
          ([tool, status]) =>
            '<article class="bp-card"><strong>' +
            tool +
            "</strong><p>" +
            escape(
              status
                ? status.configured
                  ? "Added"
                  : "Not added"
                : "Status unavailable",
            ) +
            "</p>" +
            (tool === "Gemini" && status?.remaining !== undefined
              ? "<p>" +
                Number(status.remaining) +
                " of 50 project AI requests left today.</p>"
              : "") +
            button(
              "key-" + tool,
              status?.configured ? "Rotate key" : "Add key",
            ) +
            button("test-" + tool, "Test connection") +
            (status?.configured ? button("drop-" + tool, "Remove key") : "") +
            "</article>",
        )
        .join("");
      for (const [tool] of items) {
        bind("key-" + tool, () =>
          form(
            "Save " + tool + " key",
            field(
              "key",
              tool + " API key",
              "",
              "password",
              'required autocomplete="new-password" maxlength="256"',
            ),
            (f) => connection(tool, "PUT", f.get("key").trim()),
          ),
        );
        bind("test-" + tool, async () => {
          await connection(tool, "GET", undefined, true);
          notify(tool + " connection verified.");
        });
        bind("drop-" + tool, () =>
          form(
            "Remove " + tool + " key",
            "<p>Remove this encrypted key from the project.</p>",
            () => connection(tool, "DELETE"),
          ),
        );
      }
    }
    await showCredits(true);
  }
  const page = {
    "My dashboard": dashboard,
    "Direct chats": chats,
    "AI credits": () => showCredits(),
    Settings: settings,
  }[tab];
  if (!page) return () => {};
  page().catch((err) => notify(err.message));
  if (tab === "Direct chats" || tab === "My dashboard") {
    channel = db.channel("private-inbox-" + crypto.randomUUID());
    const onChange = async (event) => {
      if (!root.isConnected) return;
      try {
        await loadThreads();
        if (tab === "My dashboard") redrawHelp();
        else if (selected && event?.new?.thread_id === selected)
          await loadMessages(selected);
        else await drawThreads();
      } catch (e) {
        notify(e.message);
      }
    };
    for (const table of ["studio_thread_messages", "studio_thread_members"])
      channel.on(
        "postgres_changes",
        { schema: "public", table, event: "INSERT" },
        onChange,
      );
    channel.subscribe();
  }
  return () => {
    clearInterval(timer);
    if (channel) db.removeChannel(channel);
  };
}
