import { projectDeadline } from "./portal/routes.js";
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
        id,
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
  {
    project,
    data,
    db,
    result,
    rpc,
    modal,
    notify,
    session,
    refresh,
    removeProject,
    escape,
    leader,
  },
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
          db.from("studio_work_log").insert({
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
    result(
      db
        .from("studio_reports")
        .select("closed_at,snapshot,delivery")
        .eq("project_id", project.id)
        .maybeSingle(),
    ).catch(() => result(db.from("studio_reports").select("closed_at,snapshot").eq("project_id",project.id).maybeSingle())),
    project.repository || project.vercel_project_id
      ? fetch("/api/activity?report=1&project=" + encodeURIComponent(project.id), {
          headers: { authorization: "Bearer " + session.access_token },
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : null,
  ])
    .then(([time, accounts, calls, snapshot, activity]) => {
      if (!root.isConnected) return;
      const live = reportRows(data.members, data.tasks, time, accounts, calls);
      const rows = Array.isArray(snapshot?.snapshot)
        ? snapshot.snapshot.map((row) => ({
            ...row,
            sharedUsage:
              live.find((r) => r.id === row.id)?.sharedUsage ||
              "No usage shared",
          }))
        : live;
      const periodStart=project.start_date || project.created_at?.slice(0,10) || "";
      const periodEnd=project.submission_deadline || "";
      const dateSpan=(start,end)=> {
        const a=Date.parse(start), b=Date.parse(end);
        return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)/3600000:null;
      };
      const commits = activity?.reportCommits;
      const delivery=snapshot?.delivery && Object.keys(snapshot.delivery).length ? snapshot.delivery : {
        start:periodStart,end:periodEnd,
        commit_first:commits?.first || "",commit_last:commits?.last || "",
        commits_sample:commits?.count ?? null,commits_truncated:commits?.truncated || false,
        url:activity?.deployment?.status === "Ready" ? activity.deployment.url : "",
        contributions:Object.fromEntries(rows.flatMap(row => {
          const name = row.name.trim().toLowerCase();
          if (rows.some(teammate=>teammate.id !== row.id && teammate.name.trim().toLowerCase() === name)) return [];
          const contributor = commits?.contributors.find(item=>[item.login,...item.names].some(alias=>alias.trim().toLowerCase() === name));
          return contributor ? [[row.id,contributor.commits]] : [];
        })),
      };
      for (const row of rows) row.commits = Number.isInteger(delivery.contributions?.[row.id]) ? delivery.contributions[row.id] : "—";
      const days=dateSpan(delivery.start,delivery.end);
      const commitSpan=dateSpan(delivery.commit_first,delivery.commit_last);
      const finalLink=typeof delivery.url==="string" && /^https:\/\/[^\s]+$/i.test(delivery.url) ? delivery.url : "";
      const timing='<section class="bp-panel"><h3>Delivery record</h3><dl class="delivery-record">' +
        '<div><dt>Hackathon dates</dt><dd>' + escape(days===null?"Dates not set":delivery.start+" – "+delivery.end+" · "+(Math.floor(days/24)+1)+" calendar days") + '</dd></div>' +
        '<div><dt>Observed commit span</dt><dd>' + escape(commitSpan===null ? (delivery.commits_sample === 0 ? "No commits during this period" : "No commit dates available") :
          commitSpan.toFixed(1)+" hours across "+delivery.commits_sample+" default-branch commits"+(delivery.commits_truncated ? " (first 500 reviewed)" : "")) + '</dd></div>' +
        '<div><dt>Final project</dt><dd>' + (finalLink?'<a target="_blank" rel="noreferrer" href="'+escape(finalLink)+'">Open final project</a>':'Link not recorded') + '</dd></div></dl></section>';
      const totalTasks = snapshot
        ? rows.reduce((sum, r) => sum + r.assigned, 0)
        : data.tasks.length;
      const completed = snapshot
        ? rows.reduce((sum, r) => sum + r.completed, 0)
        : data.tasks.filter((t) => t.status === "done").length;
      const totalHours = rows.reduce((n, r) => n + r.hours, 0).toFixed(1);
      const finished = Date.now() >= projectDeadline(project.submission_deadline);
      root.querySelector("#studio-report-content").innerHTML =
        '<div class="studio-metrics"><div><small>Completed tasks</small><strong>' +
        completed +
        " / " +
        totalTasks +
        "</strong></div><div><small>Logged hours</small><strong>" +
        totalHours +
        "</strong></div><div><small>Reporting period</small><strong>" +
        (snapshot ? "Published" : finished ? "After deadline" : "In progress") +
        "</strong></div></div>" + timing +
        '<div class="studio-table-wrap" tabindex="0" aria-label="Member contributions"><table class="studio-table"><thead><tr>' +
        [
          "Member",
          "Delivery",
          "On time / late",
          "Logged",
          "Hackathon commits",
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
              r.commits +
              "</td><td>" +
              r.studioCalls +
              "</td><td>" +
              escape(r.sharedUsage) +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>" +
        '<p class="shared-muted">On-time results use dated completions and UTC calendar dates. Studio AI counts successful assistance calls. Commit counts use the hackathon dates and match GitHub author names to project members. Shared account totals reflect current consent and recorded usage windows.</p>' +
        (rows.some(
          (r) =>
            r.name === data.members.find((m) => m.user_id === uid)?.full_name,
        )
          ? '<button type="button" class="button subtle" id="report-portfolio">Add my contribution to portfolio</button>'
          : "");
      if (leader && (!snapshot || !Object.keys(snapshot.delivery || {}).length)) {
        root
          .querySelector("#studio-report-content")
          .insertAdjacentHTML(
            "beforeend",
            '<button type="button" class="button subtle" id="report-close">Publish final report</button>',
          );
        bind("report-close", () =>
          modal(
            "Publish hackathon report",
            '<p>Save the report to every participant’s portfolio, including delivery details, logged time, and contributions.</p>' +
              '<label>Final project URL (optional)<input name="delivery_url" type="url" maxlength="1000" value="' + escape(finalLink) + '"></label>',
            async form => {
              const link=String(form.get("delivery_url")||"").trim();
              if (link && !/^https:\/\/[^\s]+$/i.test(link)) throw Error("Use an HTTPS project URL.");
              const published = await db.rpc("publish_draftdeck_final_report",{p_project:project.id,p_delivery:{...delivery,url:link}});
              if (published.error?.code === "PGRST202") await rpc("close_studio_report",{p_project:project.id});
              else if (published.error) throw Error(published.error.message);
              notify("Hackathon report published.");
            },
            refresh,
            "Publish report",
          ),
        );
      }
      if (leader && finished && snapshot && Object.keys(snapshot.delivery || {}).length) {
        root.querySelector("#studio-report-content").insertAdjacentHTML("beforeend",
          '<section class="bp-panel"><h3>Close this hackathon</h3><p>The final report is available in each participant’s portfolio. Archive the project from Overview to keep the workspace, or delete it here.</p>' +
          '<button type="button" class="button subtle" id="report-delete-project">Delete project</button></section>');
        bind("report-delete-project", () => modal(
          "Permanently delete project",
          '<p>This removes the project workspace, including its board and chats. Each participant keeps their saved report.</p>' +
          '<label>Type the exact project name <strong>' + escape(project.name) + '</strong><input name="project_name" required autocomplete="off"></label>',
          async form => {
            if (form.get("project_name") !== project.name) throw Error("Enter the exact project name.");
            await rpc("delete_finished_draftdeck_project",{p_project:project.id,p_name:form.get("project_name")});
          }, removeProject, "Permanently delete project",
        ));
      }
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
            "Hackathon commits",
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
            r.commits,
            r.studioCalls,
            r.sharedUsage,
            r.contributions.join("; "),
          ]),
          [],
          ["Hackathon start", delivery.start || ""],
          ["Hackathon deadline", delivery.end || ""],
          ["Observed commit span (hours)", commitSpan?.toFixed(1) ?? ""],
          ["Final project URL", finalLink],
        ];
        const url = URL.createObjectURL(
          new Blob(
            [grid.map((row) => row.map(csvCell).join(",")).join("\r\n")],
            { type: "text/csv;charset=utf-8" },
          ),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "draftdeck-project-report.csv";
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
                ...(finalLink ? ["Final project · " + finalLink] : []),
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
              db.from("project_messages").insert({
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
                db.from("portfolio_entries").insert({
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
