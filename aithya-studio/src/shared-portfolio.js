const entryFields = [
  ["title", "Project or case study title", 120, true],
  ["subtitle", "Role or context", 160],
  ["contribution", "Your contribution", 1800],
  ["outcome", "Outcome and evidence", 1200],
  ["skills", "Skills and tools", 400],
  ["proof_url", "Public demo, repository, or evidence link", 500],
];

function safeEvidenceUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
  } catch {}
  return "";
}

function portfolioMarkup(profile, entries, escape, appearance = {}) {
  return (
    '<article class="portfolio-preview portfolio-theme-' +
    (appearance.theme || "night") +
    " portfolio-icon-" +
    (appearance.icon || "medium") +
    '"><header><span class="portfolio-avatar" aria-hidden="true">' +
    escape(
      profile.display_name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase(),
    ) +
    "</span><h1>" +
    escape(profile.display_name) +
    "</h1>" +
    (profile.headline
      ? '<p class="portfolio-headline">' + escape(profile.headline) + "</p>"
      : "") +
    (profile.bio
      ? '<p class="portfolio-copy">' + escape(profile.bio) + "</p>"
      : "") +
    "</header>" +
    (appearance.stats
      ? '<div class="portfolio-stats">' + appearance.stats + "</div>"
      : "") +
    entries
      .map((entry) => {
        const evidence = safeEvidenceUrl(entry.proof_url);
        return (
          "<section><h2>" +
          escape(entry.title) +
          "</h2>" +
          (entry.subtitle
            ? '<p class="portfolio-subtitle">' + escape(entry.subtitle) + "</p>"
            : "") +
          (entry.contribution
            ? '<h3>Contribution</h3><p class="portfolio-copy">' +
              escape(entry.contribution) +
              "</p>"
            : "") +
          (entry.outcome
            ? '<h3>Outcome</h3><p class="portfolio-copy">' +
              escape(entry.outcome) +
              "</p>"
            : "") +
          (entry.skills
            ? '<h3>Skills</h3><p class="portfolio-copy">' +
              escape(entry.skills) +
              "</p>"
            : "") +
          (evidence
            ? '<p><a href="' +
              escape(evidence) +
              '" target="_blank" rel="noreferrer">View evidence</a></p>'
            : "") +
          "</section>"
        );
      })
      .join("") +
    "</article>"
  );
}

function downloadPortfolio(profile, entries, escape, appearance) {
  const page =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" +
    escape(profile.display_name) +
    " — Portfolio</title><style>" +
    "body{margin:0;background:#f7f6ef;color:#212620;font:17px/1.65 system-ui,sans-serif}main{max-width:760px;padding:45px 24px;margin:auto}header{border-top:4px solid;padding:20px 0}h1,h2,h3,p{margin:0 0 10px}h1{font:normal 3rem Georgia,serif}h2{font:normal 1.8rem Georgia,serif}h3{font-size:1rem;margin-top:18px}section{border-top:1px solid #b8bcae;padding:24px 0}.portfolio-headline,.portfolio-subtitle{color:#425b44}.portfolio-copy{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#254a33}.portfolio-avatar{display:grid;place-items:center;border:1px solid;border-radius:50%;width:3rem;height:3rem;margin-bottom:1rem;font-weight:700}.portfolio-icon-small .portfolio-avatar{width:2rem;height:2rem}.portfolio-icon-large .portfolio-avatar{width:4.5rem;height:4.5rem}.portfolio-theme-night{background:#121824;color:#eef3fb;padding:24px}.portfolio-theme-blueprint{background:#102b60;color:#edf4ff;padding:24px}.portfolio-theme-night a,.portfolio-theme-blueprint a,.portfolio-theme-night .portfolio-headline,.portfolio-theme-blueprint .portfolio-headline{color:inherit}.portfolio-stats{padding:10px 0}@media print{body{background:white}main{padding:0}section{break-inside:avoid}}" +
    "</style></head><body><main>" +
    portfolioMarkup(profile, entries, escape, appearance) +
    "</main></body></html>";
  const url = URL.createObjectURL(
    new Blob([page], { type: "text/html;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aithya-portfolio.html";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function renderPortfolio({
  db,
  main,
  user,
  result,
  escape,
  button,
  field,
  area,
  select,
  bind,
  modal,
  notify,
  back,
}) {
  main.innerHTML =
    '<section id="portfolio-view"><p>Loading your portfolio…</p></section>';
  const view = main.querySelector("#portfolio-view");
  const open = () => view.isConnected;
  async function load() {
    const [profile, entries, projects, logs] = await Promise.all([
      result(
        db.from("portfolios").select("*").eq("user_id", user.id).maybeSingle(),
      ),
      result(
        db
          .from("portfolio_entries")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ),
      result(db.from("projects").select("id,name,archived_at").order("name")),
      result(
        db.from("studio_work_log").select("minutes").eq("user_id", user.id),
      ).catch(() => []),
    ]);
    if (!open()) return;
    let appearance = { theme: "night", icon: "medium", showStats: false };
    try {
      const v = JSON.parse(
        localStorage.getItem("aithya.portfolio." + user.id) || "{}",
      );
      if (["night", "paper", "blueprint"].includes(v.theme))
        appearance.theme = v.theme;
      if (["small", "medium", "large"].includes(v.icon))
        appearance.icon = v.icon;
      appearance.showStats = v.showStats === true;
    } catch {}
    const active = projects.filter((p) => !p.archived_at).length,
      hours =
        Math.round(logs.reduce((n, r) => n + Number(r.minutes), 0) / 6) / 10;
    const stats =
      active +
      " active " +
      (active === 1 ? "project" : "projects") +
      " · " +
      hours +
      " logged hours";
    appearance.stats = appearance.showStats ? stats : "";
    const draft = profile || {
      display_name: user.user_metadata?.full_name || "",
      headline: "",
      bio: "",
    };
    view.innerHTML =
      '<header class="shared-header"><div><h1>Your portfolio</h1><p class="shared-muted">Choose what to include in your case studies. Download an HTML copy when it is ready to share.</p></div>' +
      button("portfolio-back", "Back to workspace") +
      '</header><div class="shared-columns"><section><div class="shared-actions">' +
      button("portfolio-profile", "Edit profile", true) +
      button("portfolio-add", "Add case study") +
      button("portfolio-appearance", "Customize design") +
      (profile ? button("portfolio-download", "Download HTML") : "") +
      '</div><p class="portfolio-private-stats">' +
      escape(stats) +
      "</p>" +
      entries
        .map(
          (entry) =>
            '<article class="shared-row"><div><b>' +
            escape(entry.title) +
            "</b><p>" +
            escape(entry.subtitle) +
            "</p></div>" +
            button("portfolio-edit-" + entry.id, "Edit") +
            button("portfolio-remove-" + entry.id, "Remove") +
            "</article>",
        )
        .join("") +
      '</section><section aria-label="Portfolio preview">' +
      (profile
        ? portfolioMarkup(profile, entries, escape, appearance)
        : '<p class="shared-note">Add your display name and profile to preview the portfolio.</p>') +
      "</section></div>";
    bind("portfolio-back", back);
    bind("portfolio-appearance", () =>
      modal(
        "Portfolio appearance",
        select(
          "theme",
          "Theme",
          [
            ["night", "Night"],
            ["paper", "Paper"],
            ["blueprint", "Blueprint"],
          ],
          appearance.theme,
        ) +
          select(
            "icon",
            "Profile icon size",
            [
              ["small", "Small"],
              ["medium", "Medium"],
              ["large", "Large"],
            ],
            appearance.icon,
          ) +
          '<label><input name="stats" type="checkbox" ' +
          (appearance.showStats ? "checked" : "") +
          "> Include project and time totals in the shareable portfolio</label>",
        (f) =>
          localStorage.setItem(
            "aithya.portfolio." + user.id,
            JSON.stringify({
              theme: f.get("theme"),
              icon: f.get("icon"),
              showStats: f.has("stats"),
            }),
          ),
        load,
      ),
    );

    bind("portfolio-profile", () =>
      modal(
        "Portfolio profile",
        field(
          "display_name",
          "Display name",
          draft.display_name,
          "text",
          true,
        ) +
          field("headline", "Headline", draft.headline) +
          area("bio", "About you", draft.bio),
        async (form) => {
          const values = Object.fromEntries(form);
          for (const name of Object.keys(values))
            values[name] = values[name].trim();
          if (
            !values.display_name ||
            values.display_name.length > 100 ||
            values.headline.length > 160 ||
            values.bio.length > 1600
          )
            throw Error(
              "Use a display name up to 100 characters, headline up to 160, and bio up to 1,600.",
            );
          await result(
            db.from("portfolios").upsert({ user_id: user.id, ...values }),
          );
        },
        load,
      ),
    );
    function edit(entry) {
      modal(
        entry ? "Edit case study" : "Add case study",
        (!entry && projects.length
          ? select(
              "project",
              "Use a project name (optional)",
              [
                ["", "Choose a project"],
                ...projects.map((project) => [project.id, project.name]),
              ],
              "",
            )
          : "") +
          entryFields
            .map(([name, label, limit, required]) =>
              (["contribution", "outcome"].includes(name)
                ? area(name, label, entry?.[name])
                : field(
                    name,
                    label,
                    entry?.[name],
                    name === "proof_url" ? "url" : "text",
                    required,
                  )
              ).replace(/maxlength="\d+"/, 'maxlength="' + limit + '"'),
            )
            .join(""),
        async (form) => {
          const values = Object.fromEntries(
            entryFields.map(([name]) => [
              name,
              String(form.get(name) || "").trim(),
            ]),
          );
          if (!values.title) throw Error("Enter a title.");
          if (values.proof_url) {
            values.proof_url = safeEvidenceUrl(values.proof_url);
            if (!values.proof_url) throw Error("Enter a public HTTPS link.");
          }
          await result(
            entry
              ? db
                  .from("portfolio_entries")
                  .update(values)
                  .eq("id", entry.id)
                  .eq("user_id", user.id)
              : db
                  .from("portfolio_entries")
                  .insert({ user_id: user.id, ...values }),
          );
        },
        load,
      );
      const picker = document.getElementById("f-project");
      if (picker)
        picker.onchange = () => {
          const selected = projects.find((item) => item.id === picker.value);
          if (selected)
            document.getElementById("f-title").value = selected.name.slice(
              0,
              120,
            );
        };
    }
    bind("portfolio-add", () => edit());
    if (profile)
      bind("portfolio-download", () =>
        downloadPortfolio(profile, entries, escape, appearance),
      );
    for (const entry of entries) {
      bind("portfolio-edit-" + entry.id, () => edit(entry));
      bind("portfolio-remove-" + entry.id, () =>
        modal(
          "Remove case study",
          "<p>Remove <strong>" +
            escape(entry.title) +
            '</strong> from your portfolio?</p><label><input name="confirm" type="checkbox" required>Confirm removal</label>',
          async (form) => {
            if (!form.has("confirm")) throw Error("Confirm removal.");
            await result(
              db
                .from("portfolio_entries")
                .delete()
                .eq("id", entry.id)
                .eq("user_id", user.id),
            );
            notify("Case study removed.");
          },
          load,
        ),
      );
    }
  }
  try {
    await load();
  } catch (error) {
    if (open()) {
      view.textContent = error.message;
      notify("Could not load your portfolio.");
    }
  }
}
