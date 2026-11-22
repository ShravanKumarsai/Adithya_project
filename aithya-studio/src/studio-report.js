function csvCell(value) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[\s]*[=+@-]/.test(text) ? "'" : "") +
    text.replaceAll('"', '""') +
    '"'
  );
}

export function reportRows(members, tasks, time, accounts, calls) {
  return members
    .filter((m) => m.status === "accepted")
    .map((member) => {
      const id = member.user_id;
      const assigned = tasks.filter((t) => t.owner_id === id);
      const completed = assigned.filter((t) => t.status === "done");
      const dated = completed.filter((t) => t.due_date && t.completed_at);
      const unknown = completed.filter(
        (t) => t.due_date && !t.completed_at,
      ).length;
      const onTime = dated.filter(
        (t) => t.completed_at.slice(0, 10) <= t.due_date,
      ).length;
      const usage = new Map();
      for (const a of accounts.filter((a) => a.user_id === id && a.shared)) {
        for (const w of a.studio_ai_usage_windows?.length
          ? a.studio_ai_usage_windows
          : [a]) {
          const key = w.tool + " · " + w.unit.toLowerCase();
          usage.set(key, (usage.get(key) || 0) + Number(w.used));
        }
      }
      return {
        name: member.full_name,
        role: member.role || "Member",
        assigned: assigned.length,
        completed: completed.length,
        onTime,
        late: dated.length - onTime,
        unknown,
        hours:
          Math.round(
            time
              .filter((t) => t.user_id === id)
              .reduce((sum, t) => sum + t.minutes, 0) / 6,
          ) / 10,
        studioCalls: calls.filter((c) => c.ok && c.user_id === id).length,
        sharedUsage:
          [...usage].map(([tool, total]) => tool + ": " + total).join(", ") ||
          "No usage shared",
        contributions: completed.map((t) => t.title),
      };
    });
}

export function mountReport(
  { project, data, db, result, modal, notify, session, refresh, escape },
  root,
) {
  const actions =
    '<div class="shared-actions"><button type="button" class="button primary" id="report-log">Log time</button><button type="button" class="button subtle" id="report-export" disabled>Export CSV</button><button type="button" class="button subtle" id="report-share" disabled>Share in team chat</button></div>';
  root.innerHTML =
    '<header class="clean-page-heading"><div><h2>Hackathon report</h2><p>Contributions, delivery and AI usage for ' +
    escape(project.name) +
    ".</p></div>" +
    actions +
    '</header><div id="studio-report-content" aria-live="polite">Loading contributions…</div>';
  const uid = session.user.id;
  const bind = (id, fn) => {
    const b = root.querySelector("#" + id);
    b.onclick = async () => {
      b.disabled = true;
      try {
        await fn();
      } catch (e) {
        notify(e.message);
      } finally {
        b.disabled = false;
      }
    };
  };
  bind("report-log", () =>
    modal(
      "Log project time",
      '<p>Time entries are visible to your project team.</p><label>Work date<input name="work_day" type="date" required></label><label>Minutes worked<input name="minutes" type="number" min="1" max="1440" required></label>',
      (f) =>
        result(
          db
            .from("studio_work_log")
            .insert({
              project_id: project.id,
              work_day: f.get("work_day"),
              minutes: Number(f.get("minutes")),
            }),
        ),
      refresh,
    ),
  );
  const projectRows = (table, columns) =>
    result(db.from(table).select(columns).eq("project_id", project.id));
  Promise.all([
    projectRows("studio_work_log", "user_id,minutes"),
    data.personalReady
      ? result(
          db
            .from("studio_ai_accounts")
            .select(
              "user_id,tool,used,unit,shared,studio_ai_usage_windows(tool,unit,used)",
            )
            .eq("project_id", project.id)
            .eq("shared", true),
        ).catch(() =>
          result(
            db
              .from("studio_ai_accounts")
              .select("user_id,tool,used,unit,shared")
              .eq("project_id", project.id)
              .eq("shared", true),
          ),
        )
      : [],
    projectRows("ai_runs", "user_id,ok"),
  ])
    .then(([time, accounts, calls]) => {
      if (!root.isConnected) return;
      const rows = reportRows(data.members, data.tasks, time, accounts, calls);
      const completed = data.tasks.filter((t) => t.status === "done").length;
      const totalHours = rows.reduce((n, r) => n + r.hours, 0).toFixed(1);
      const finished =
        project.submission_deadline &&
        Date.now() >
          new Date(project.submission_deadline + "T23:59:59Z").getTime();
      root.querySelector("#studio-report-content").innerHTML =
        '<div class="studio-metrics"><div><small>Completed tasks</small><strong>' +
        completed +
        " / " +
        data.tasks.length +
        "</strong></div><div><small>Logged hours</small><strong>" +
        totalHours +
        "</strong></div><div><small>Reporting period</small><strong>" +
        (finished ? "After deadline" : "In progress") +
        "</strong></div></div>" +
        '<div class="studio-table-wrap" tabindex="0" aria-label="Member contributions"><table class="studio-table"><thead><tr>' +
        [
          "Member",
          "Delivery",
          "On time / late",
          "Logged",
          "Studio AI",
          "Shared account usage",
        ]
          .map((x) => '<th scope="col">' + x + "</th>")
          .join("") +
        "</tr></thead><tbody>" +
        rows
          .map(
            (r) =>
              '<tr><th scope="row">' +
              escape(r.name) +
              "<small>" +
              escape(r.role) +
              "</small></th><td>" +
              r.completed +
              " / " +
              r.assigned +
              (r.contributions.length
                ? "<details><summary>View work</summary><ul>" +
                  r.contributions
                    .map((t) => "<li>" + escape(t) + "</li>")
                    .join("") +
                  "</ul></details>"
                : "") +
              "</td><td>" +
              r.onTime +
              " / " +
              r.late +
              (r.unknown ? "<small>" + r.unknown + " unknown</small>" : "") +
              "</td><td>" +
              r.hours +
              " h</td><td>" +
              r.studioCalls +
              "</td><td>" +
              escape(r.sharedUsage) +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>" +
        '<p class="shared-muted">On-time results use dated completions and UTC calendar dates. Studio AI counts successful assistance calls. Shared account usage is self-reported. Totals include recorded usage windows.</p>' +
        (rows.some(
          (r) =>
            r.name === data.members.find((m) => m.user_id === uid)?.full_name,
        )
          ? '<button type="button" class="button subtle" id="report-portfolio">Add my contribution to portfolio</button>'
          : "");
      for (const id of ["report-export", "report-share"])
        root.querySelector("#" + id).disabled = false;
      bind("report-export", () => {
        const grid = [
          [
            "Member",
            "Role",
            "Tasks assigned",
            "Completed",
            "On time",
            "Late",
            "Unknown",
            "Logged hours",
            "Studio AI calls",
            "Shared usage",
            "Contributions",
          ],
          ...rows.map((r) => [
            r.name,
            r.role,
            r.assigned,
            r.completed,
            r.onTime,
            r.late,
            r.unknown,
            r.hours,
            r.studioCalls,
            r.sharedUsage,
            r.contributions.join("; "),
          ]),
        ];
        const url = URL.createObjectURL(
          new Blob(
            [grid.map((row) => row.map(csvCell).join(",")).join("\r\n")],
            { type: "text/csv;charset=utf-8" },
          ),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "aithya-project-report.csv";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      });
      bind("report-share", () =>
        modal(
          "Share report in team chat",
          '<label>Message<textarea name="message" maxlength="6000" required>' +
            escape(
              [
                "Hackathon report · " + project.name,
                completed +
                  " completed tasks · " +
                  totalHours +
                  " logged hours",
                ...rows.map(
                  (r) =>
                    r.name +
                    " · " +
                    r.role +
                    " · " +
                    r.completed +
                    "/" +
                    r.assigned +
                    " completed · " +
                    r.hours +
                    " h",
                ),
              ]
                .join("\n")
                .slice(0, 5900),
            ) +
            "</textarea></label>",
          async (f) => {
            await result(
              db
                .from("project_messages")
                .insert({
                  project_id: project.id,
                  kind: "text",
                  body: f.get("message"),
                }),
            );
            notify("Report posted to the team channel.");
          },
          () => {},
        ),
      );
      if (root.querySelector("#report-portfolio"))
        bind("report-portfolio", () => {
          const mine =
            rows[
              data.members
                .filter((m) => m.status === "accepted")
                .findIndex((m) => m.user_id === uid)
            ];
          modal(
            "Add contribution to portfolio",
            '<label>Case study title<input name="title" required maxlength="120" value="' +
              escape(project.name.slice(0, 120)) +
              '"></label><label>Contribution<textarea name="contribution" maxlength="1800">' +
              escape(
                [mine.role, ...mine.contributions].join("\n").slice(0, 1800),
              ) +
              "</textarea></label>",
            async (f) => {
              await result(
                db
                  .from("portfolio_entries")
                  .insert({
                    user_id: uid,
                    title: f.get("title"),
                    subtitle: mine.role.slice(0, 160),
                    contribution: f.get("contribution"),
                    outcome:
                      mine.completed +
                      " completed tasks · " +
                      mine.hours +
                      " logged hours",
                  }),
              );
              notify("Contribution added to your portfolio.");
            },
            () => {},
          );
        });
    })
    .catch((error) => {
      if (root.isConnected)
        root.querySelector("#studio-report-content").textContent =
          "Report unavailable. Refresh to retry. " + error.message;
    });
}
