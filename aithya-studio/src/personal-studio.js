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
    liveCreditsTimer,
    liveCreditsRequest,
    selected,
    details,
    threads = [],
    markers = [],
    credits = [],
    liveCredits = [],
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
    bind("help", () => openSheet("Chats"));
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
        field("exact_reset", "Exact reset time (optional)", "", "datetime-local") +
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
        const exactReset = values.get("exact_reset") ? new Date(values.get("exact_reset")) : null;
        if (exactReset && (!Number.isFinite(+exactReset) || +exactReset <= Date.now()))
          throw Error("Choose a future reset time.");
        const row = {
          project_id: id,
          user_id: user,
          tool: values.get("tool"),
          handle: values.get("handle").trim(),
          unit: values.get("unit"),
          allowance: Number(values.get("allowance")),
          used: Number(values.get("used")),
          window_hours: window,
          reset_at: exactReset?.toISOString() || (reset
            ? new Date(Date.now() + window * 3600000).toISOString()
            : account.reset_at),
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
    target.innerHTML = rows.length
      ? '<div class="studio-table-wrap" tabindex="0" aria-label="AI account usage"><table class="studio-table credits-table"><thead><tr><th scope="col">Account</th><th scope="col">Usage</th><th scope="col">Window</th><th scope="col">Manage</th></tr></thead><tbody>' +
        rows
          .map((c) => {
            const seconds = Math.max(
              0,
              Math.ceil((Date.parse(c.reset_at) - now) / 1000),
            );
            const countdown = seconds
              ? (seconds >= 3600 ? Math.floor(seconds / 3600) + "h " : "") +
                Math.floor((seconds % 3600) / 60) +
                "m " +
                (seconds % 60) +
                "s"
              : "Scheduled reset reached";
            return (
              '<tr><th scope="row">' +
              escape(c.tool) +
              (c.handle ? "<small>" + escape(c.handle) + "</small>" : "") +
              "<small>" +
              escape(name(c.user_id)) +
              "</small></th><td>" +
              (seconds ? c.used + " / " + c.allowance + " " + escape(c.unit.toLowerCase()) +
                '<progress max="' + c.allowance + '" value="' + Math.min(c.allowance, c.used) +
                '" aria-label="' + escape(c.tool) + ' usage"></progress>' : "Update usage") +
              "</td>" +
              "<td>" +
              countdown +
              (c.user_id === user
                ? "<small>" + (c.shared ? "Shared" : "Private") + "</small>"
                : "") +
              "</td><td>" +
              (c.user_id === user
                ? button("edit-credit-" + c.id, "Edit") +
                  button("remove-credit-" + c.id, "Remove")
                : "") +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>"
      : "<p>No visible AI accounts.</p>";
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
    const ordered = credits.filter((c) => Date.parse(c.reset_at) > Date.now()).sort(
      (a, b) => available(b) / b.allowance - available(a) / a.allowance,
    );
    const low = ordered.filter((c) => available(c) / c.allowance <= 0.15);
    const next = ordered
      .filter((c) => Date.parse(c.reset_at) > Date.now())
      .sort((a, b) => Date.parse(a.reset_at) - Date.parse(b.reset_at))[0];
    const item = (label, value, note = "") =>
      "<div><small>" +
      escape(label) +
      "</small><strong>" +
      escape(value) +
      "</strong>" +
      (note ? "<p>" + escape(note) + "</p>" : "") +
      "</div>";
    return (
      '<div class="studio-metrics">' +
      item(
        "Most headroom",
        ordered[0] ? name(ordered[0].user_id) : "No accounts",
        ordered[0]?.tool,
      ) +
      item("Near limit", low.length) +
      item(
        "Next refresh",
        next
          ? new Date(next.reset_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "None",
        next?.tool,
      ) +
      "</div>"
    );
  }
  async function loadLiveCredits() {
    liveCredits = await result(
      db.from("studio_claude_connections")
        .select("id,user_id,shared,provider,studio_claude_windows(window_key,used,reset_at,synced_at)")
        .eq("project_id", id),
    );
  }
  const providers = {claude: "Claude Code", codex: "ChatGPT · Codex"};
  const windowLabels = {
    five_hour: "5-hour limit", seven_day: "Weekly limit",
    primary: "Primary limit", secondary: "Secondary limit",
  };
  function connectorSetup(provider, existing) {
    const title = providers[provider];
    const filename = "aithya-" + provider + "-setup.py";
    form(
      "Connect " + title,
      "<p>Sign in to " + escape(title) + " on your computer first. Download and run your personal setup file once to start syncing. Keep the file private.</p>" +
        '<p>On macOS or Linux, run <code>python3 ~/Downloads/' + filename + '</code> after downloading.</p>' +
        (provider === "codex" ? "<p>Keep the terminal open while you want Codex usage to sync.</p>" :
          "<p>Restart Claude Code and send a message after setup.</p>") +
        (existing ? "<p>A new download revokes the previous connector for this project.</p>" : ""),
      async () => {
        const response = await fetch("/ai-credit-connector.txt");
        if (!response.ok) throw Error("Could not download the connector. Try again.");
        const source = await response.text();
        const placeholder = "PAIRING = None";
        if (!source.includes(placeholder)) throw Error("The connector download is unavailable.");
        const token = await rpc("connect_studio_ai_provider", {p_project: id, p_provider: provider});
        const pairing = JSON.stringify({provider, project: id, token});
        const script = source.replace(placeholder, () => "PAIRING = " + pairing);
        const href = URL.createObjectURL(new Blob([script], {type: "text/x-python"}));
        const link = Object.assign(document.createElement("a"), {href, download: filename});
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(href), 30000);
      },
      refresh,
    );
    document.querySelector("#shared-form button.primary").textContent = "Download setup file";
  }
  function drawLiveCredits(target, ownOnly, reload) {
    const mine = liveCredits.filter((c) => c.user_id === user);
    const now = Date.now();
    const visible = liveCredits.filter((c) => !ownOnly || c.user_id === user);
    target.innerHTML = panel(
      "Live usage",
      '<p>Connect Claude Code or Codex for real usage and reset alerts. Codex tracks its own ChatGPT allowance.</p>' +
        Object.entries(providers).map(([provider, label]) =>
          button("provider-" + provider, (mine.some((c) => c.provider === provider) ? "Set up again · " : "Connect ") + label)
        ).join(" ") +
        (visible.length ? '<div class="studio-table-wrap" tabindex="0" aria-label="Live AI quota windows"><table class="studio-table credits-table"><thead><tr><th scope="col">Account</th><th scope="col">Window</th><th scope="col">Usage</th><th scope="col">Reset</th></tr></thead><tbody>' +
          visible.map((connection) => {
            const windows = connection.studio_claude_windows;
            const account = '<th scope="row">' + escape(providers[connection.provider]) +
              '<small>' + escape(name(connection.user_id)) + '</small></th>';
            if (!windows.length) return '<tr>' + account + '<td colspan="3">Waiting for the first reading.</td></tr>';
            return [...windows].sort((a, b) => a.window_key.localeCompare(b.window_key)).map((reading) => {
              const ended = Date.parse(reading.reset_at) <= now;
              const fresh = now - Date.parse(reading.synced_at) < 180000;
              const label = windowLabels[reading.window_key];
              return '<tr>' + account + '<td>' + label +
                '</td><td>' + (ended ? 'Awaiting next reading' : escape(reading.used) + '% used' +
                  '<progress max="100" value="' + escape(reading.used) + '" aria-label="' + label + ' used"></progress>') +
                '<small>' + escape((ended || !fresh ? "Last synced " : "Live · synced ") + when(reading.synced_at)) +
                '</small></td><td>' + (ended ? 'Reset time reached' : escape(when(reading.reset_at))) + '</td></tr>';
            }).join("");
          }).join("") + '</tbody></table></div>' : "") +
        mine.map((c) => '<div class="credit-actions">' + escape(providers[c.provider]) + ' ' +
          button("sharing-" + c.id, c.shared ? "Make private" : "Share with team") +
          button("disconnect-" + c.id, "Disconnect") + '</div>').join(""),
    );
    Object.keys(providers).forEach((provider) =>
      bind("provider-" + provider, () => connectorSetup(provider, mine.some((c) => c.provider === provider)), target)
    );
    for (const connection of mine) {
      bind("sharing-" + connection.id, async () => {
        await result(db.from("studio_claude_connections").update({shared: !connection.shared}).eq("id", connection.id));
        await reload();
      }, target);
      bind("disconnect-" + connection.id, () => form("Disconnect " + providers[connection.provider],
        "<p>This revokes the connector and removes its readings from this project.</p>",
        () => result(db.from("studio_claude_connections").delete().eq("id", connection.id)), reload), target);
    }
  }
  async function showCredits(own = false) {
    await loadCredits();
    if (!root.isConnected) return;
    add('<div id="v3-live-credits"></div>');
    add(
      panel(
        own ? "Personal AI accounts" : "Manual tracking",
        "<p>Track ChatGPT chat, Gemini, Copilot, or any tool. Enter usage and a window length to get a reset reminder.</p>" +
          button("account", "Add manual tracker") +
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
    const live = root.querySelector("#v3-live-credits");
    const reloadLiveCredits = async () => {
      if (liveCreditsRequest || !live.isConnected) return;
      liveCreditsRequest = loadLiveCredits();
      try {
        await liveCreditsRequest;
        if (live.isConnected && (!live.contains(document.activeElement) || document.activeElement.disabled))
          drawLiveCredits(live, own, reloadLiveCredits);
      } catch {
        if (live.isConnected && !live.hasChildNodes())
          live.innerHTML = panel("Live usage", "<p>Live usage could not load. Retrying shortly.</p>");
      } finally {
        liveCreditsRequest = null;
      }
    };
    reloadLiveCredits();
    liveCreditsTimer = setInterval(() => {
      if (!document.hidden) reloadLiveCredits();
    }, 15000);
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
    const box = root.querySelector("#studio-private-list");
    if (!box) return;
    box.innerHTML =
      button("new-conversation", "New chat") +
      '<div id="v3-thread-list"></div>';
    bind("new-conversation", createThread);
    await loadThreads();
    if (root.isConnected) await drawThreads();
    root.addEventListener("team-thread-open", () => {
      selected = null;
      drawThreads().catch((e) => notify(e.message));
    });
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
          return (
            '<button type="button" class="conversation-link" aria-current="' +
            (selected === t.id) +
            '" data-v3="open-' +
            t.id +
            '"><span class="chat-avatar" aria-hidden="true">' +
            escape(t.topic.slice(0, 2).toUpperCase()) +
            "</span><span><strong>" +
            escape(t.topic) +
            "</strong><small>" +
            escape(
              (t.skill || "Private chat") +
                (count ? " · " + count + " unread" : ""),
            ) +
            "</small></span></button>"
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
    root.querySelector(".studio-chat").classList.add("show-thread");
    root.querySelector("#studio-team-thread").hidden = true;
    root
      .querySelector('[data-bp="team-thread"]')
      .setAttribute("aria-current", "false");
    box.hidden = false;
    const names = markers
      .filter((m) => m.thread_id === threadId)
      .map((m) => name(m.user_id))
      .join(", ");
    box.innerHTML =
      "<header><div><h2>" +
      escape(thread.topic) +
      "</h2><p>" +
      escape(names) +
      "</p></div>" +
      button("back-chats", "All chats") +
      "</header>" +
      '<div id="v3-direct-log" class="studio-chat-log" role="log" aria-live="polite"></div><div class="studio-composer">' +
      '<details><summary>Actions</summary><div class="chat-actions">' +
      
      (thread.creator_id === user
        ? button(
            "resolve-direct",
            thread.resolved ? "Reopen help request" : "Resolve help request",
          )
        : "") +
      "</div></details>" +
      '<label class="studio-attach" title="Attach a private file"><span aria-hidden="true">＋</span><span class="studio-sr">Attach a private file</span><input name="direct_file" type="file"></label>' +
      '<label class="studio-message-field"><span class="studio-sr">Message</span><textarea name="direct_message" rows="1" maxlength="6000" placeholder="Write a message"></textarea></label>' +
      button("send-direct", "Send reply") +
      '<output id="direct-attachment-name"></output></div>';
    box.querySelector("[name=direct_file]").onchange = (e) =>
      (box.querySelector("#direct-attachment-name").textContent =
        e.target.files[0]?.name || "");
    bind(
      "back-chats",
      () => root.querySelector(".studio-chat").classList.remove("show-thread"),
      box,
    );
    box.querySelector("[name=direct_message]").onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        box.querySelector("[data-v3=send-direct]").click();
      }
    };
    bind(
      "send-direct",
      async () => {
        const input = box.querySelector("[name=direct_message]");
        const picker = box.querySelector("[name=direct_file]");
        const file = picker.files[0];
        const body = input.value.trim() || file?.name;
        if (!body) throw Error("Write a message or choose a file.");
        if (file && (!file.size || file.size > 10 * 1024 * 1024))
          throw Error("Choose a file between one byte and 10 MB.");
        const storage = db.storage.from("studio-direct");
        const path = file
          ? threadId + "/" + user + "/" + crypto.randomUUID()
          : null;
        if (file) await result(storage.upload(path, file));
        try {
          const message = await result(
            db
              .from("studio_thread_messages")
              .insert({ thread_id: threadId, body })
              .select("id")
              .single(),
          );
          if (file)
            await addRow("studio_thread_attachments", {
              message_id: message.id,
              thread_id: threadId,
              path,
              filename: file.name.slice(0, 255),
              bytes: file.size,
            });
        } catch (error) {
          if (path) await storage.remove([path]);
          throw error;
        }
        input.value = "";
        picker.value = "";
        box.querySelector("#direct-attachment-name").textContent = "";
        await loadMessages(threadId);
      },
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
    const files = rows.length
      ? await result(
          db
            .from("studio_thread_attachments")
            .select("*")
            .eq("thread_id", threadId)
            .in(
              "message_id",
              rows.map((m) => m.id),
            ),
        )
      : [];
    if (!log.isConnected || selected !== threadId) return;
    messages = rows.reverse();
    const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
    log.innerHTML =
      messages
        .map((m) => {
          const file = files.find((f) => f.message_id === m.id);
          return (
            '<article class="chat-bubble ' +
            (m.author_id === user ? "mine" : "theirs") +
            '"><small>' +
            escape(m.author_id === user ? "You" : name(m.author_id)) +
            " · " +
            escape(when(m.created_at)) +
            "</small><p>" +
            escape(m.body) +
            "</p>" +
            (file
              ? button("direct-file-" + m.id, "Download " + file.filename)
              : "") +
            "</article>"
          );
        })
        .join("") || "<p>No replies yet.</p>";
    if (follow) log.scrollTop = log.scrollHeight;
    for (const file of files)
      bind(
        "direct-file-" + file.message_id,
        async () => {
          const blob = await result(
            db.storage.from("studio-direct").download(file.path),
          );
          const url = URL.createObjectURL(blob),
            link = document.createElement("a");
          link.href = url;
          link.download = file.filename;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        },
        log,
      );
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
  async function registration(){
    await loadDetails();
    if(!root.isConnected)return;
    const person=accepted.find(m=>m.user_id===user);
    const availability=data.availability.find(a=>a.user_id===user)||{};
    const known=data.skills.filter(s=>s.user_id===user);
    const interests=(person?.interests||[]);
    add(panel("Register",'<form id="studio-register" class="shared-form">'+
      '<label>Email<input type="email" readonly value="'+escape(session.user.email||"")+'"></label>'+
      field("full_name","Full name",person?.full_name||session.user.user_metadata?.full_name||"","text","required")+
      field("interests","Interests",Array.isArray(interests)?interests.join(", "):interests,"textarea",'maxlength="1000"')+
      field("expertise","Expertise",details.expertise,"textarea",'maxlength="1800"')+
      field("history","Past hackathon roles",details.history,"textarea",'maxlength="2500"')+
      '<div class="studio-standup-fields">'+field("past","Hours per week in past hackathons",details.past_hours||0,"number",'min="0" max="168"')+
      field("hours","Available hours per week",availability.weekly_hours||0,"number",'min="0" max="168" required')+'</div>'+
      '<fieldset><legend>Skills · 0–5</legend><div class="studio-standup-fields">'+studioSkills.map((skill,i)=>
        field("skill"+i,skill,details.ratings?.[skill]??rank[known.find(s=>s.skill_name===skill)?.self_assessed_level]??0,"number",'min="0" max="5" step="1" required')).join("")+
      '</div></fieldset><button class="button primary" type="submit">Save profile and draft role</button></form>'));
    const form=root.querySelector("#studio-register");
    form.onsubmit=async event=>{
      event.preventDefault();
      const submit=event.submitter;submit.disabled=true;
      try{
        const values=new FormData(form),hours=Number(values.get("hours"));
        const ratings=Object.fromEntries(studioSkills.map((skill,i)=>[skill,Number(values.get("skill"+i))]));
        const existing=known.map(s=>({skill_name:s.skill_name,category:s.category,proficiency:s.self_assessed_level,evidence:s.self_evidence||""}));
        const levels=["","beginner","intermediate","intermediate","advanced","expert"];
        for(const [skill,level] of Object.entries(ratings)){
          const current=existing.find(s=>s.skill_name.toLowerCase()===skill.toLowerCase());
          if(level>0&&current)current.proficiency=levels[level];
          else if(level>0)existing.push({skill_name:skill,category:"General",proficiency:levels[level],evidence:""});
        }
        await rpc("save_complete_member_profile",{p_project_id:id,p_profile:{full_name:values.get("full_name"),interests:String(values.get("interests")).split(/,|\n/).map(x=>x.trim()).filter(Boolean),preferred_technologies:[],availability:hours+" hours per week"},p_skills:existing,p_availability:{...availability,weekly_hours:hours,timezone:availability.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone}});
        await saveDetails({expertise:values.get("expertise"),history:values.get("history"),past_hours:Number(values.get("past")),ratings});
        details={...details,ratings};
        notify("Profile saved.");
        const answer=await aiJSON("role.analysis",{},roleFallback);
        draft("role.analysis",answer,role=>saveDetails({role_draft:role}),"Save suggested role");
      }catch(e){notify(e.message)}finally{submit.disabled=false}
    };
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
                "",
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
      add('<div id="v3-connectors" class="setup-columns"></div>');
      bind("repository", editConnections);
      bind("policy", editPolicy);
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
            '<article class="bp-panel settings-connection"><header><h2>' +
            tool +
            '</h2><span class="studio-chip '+(status?.configured?"ok":"warn")+'">' +
            escape(
              status
                ? status.configured
                  ? "Added"
                  : "Not added"
                : "Status unavailable",
            ) +
            "</span></header>" +
            (tool==="GitHub"?'<p>'+escape(project.repository||"Choose a repository")+'</p>':tool==="Vercel"?'<p>'+escape(project.vercel_project_id||"Choose a Vercel project")+'</p>':"")+
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
    Chat: ctx.data.personalReady ? chats : undefined,
    "AI credits": () => showCredits(),
    Settings: settings,
    Register:registration,
  }[tab];
  if (!page) return () => {};
  page().catch((err) => notify(err.message));
  if ((tab === "Chat" && ctx.data.personalReady) || tab === "My dashboard") {
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
    for (const table of [
      "studio_thread_messages",
      "studio_thread_members",
      "studio_thread_attachments",
    ])
      channel.on(
        "postgres_changes",
        { schema: "public", table, event: "INSERT" },
        onChange,
      );
    channel.subscribe();
  }
  return () => {
    clearInterval(timer);
    clearInterval(liveCreditsTimer);
    if (channel) db.removeChannel(channel);
  };
}
