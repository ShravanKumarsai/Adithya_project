import { rulebookLimit } from "./lib/rulebook-limits.js";
const fieldDefinitions = [
  [
    "project",
    "hackathon_name",
    "Hackathon name",
    /^(?:hackathon|competition|event)(?: name| title)?$/i,
  ],
  ["project", "name", "Project name", /^project (?:name|title)$/i],
  [
    "project",
    "description",
    "Description",
    /^(?:project (?:description|overview)|(?:hackathon|event|competition) (?:description|overview))$/i,
  ],
  [
    "project",
    "problem_statement",
    "Problem statement",
    /^(?:problem statement|challenge brief|challenge statement|problem to solve)$/i,
  ],
  [
    "project",
    "start_date",
    "Start date",
    /^(?:(?:event|hackathon|competition) start(?: date)?|start date|kickoff(?: date)?)$/i,
  ],
  [
    "project",
    "submission_deadline",
    "Submission deadline",
    /^(?:final (?:submission|deadline)|submission (?:deadline|due date|closes|cutoff)|deadline|submit by)$/i,
  ],
  ["project", "theme", "Theme", /^(?:(?:hackathon|event) )?(?:theme|track)$/i],
  [
    "project",
    "repository",
    "GitHub repository",
    /^(?:github(?: repository| repo| url)?|project repository)$/i,
  ],
  [
    "project",
    "expected_deliverables",
    "Expected deliverables",
    /^(?:(?:expected|required|submission|project) )?deliverables$/i,
    true,
  ],
  [
    "project",
    "technology_stack",
    "Technology stack",
    /^(?:tech(?:nology)? stack|required technologies|approved technologies)$/i,
    true,
  ],
  [
    "project",
    "workflow_content",
    "Existing workflow",
    /^(?:existing|project|required|recommended) workflow$/i,
  ],
  [
    "requirements",
    "judging_criteria",
    "Judging criteria",
    /^(?:judging|evaluation|assessment|scoring) (?:criteria|rubric)$/i,
    true,
  ],
  [
    "requirements",
    "mandatory_requirements",
    "Official requirements",
    /^(?:(?:official|mandatory|submission|eligibility|competition) )?requirements$/i,
    true,
  ],
  [
    "requirements",
    "restrictions",
    "Submission restrictions",
    /^(?:(?:submission|competition|project) )?(?:restrictions|limitations|prohibitions)$/i,
    true,
  ],
  [
    "ai",
    "permitted_ai_tools",
    "Permitted AI tools",
    /^(?:allowed|approved|permitted) ai tools$/i,
    true,
  ],
  [
    "ai",
    "prohibited_ai_tools",
    "Prohibited AI tools",
    /^(?:banned|disallowed|prohibited|forbidden) ai tools$/i,
    true,
  ],
  [
    "ai",
    "permitted_models",
    "Permitted AI models",
    /^(?:allowed|approved|permitted) (?:ai )?models$/i,
    true,
  ],
  [
    "ai",
    "privacy_restrictions",
    "Privacy restrictions",
    /^(?:privacy(?: (?:restrictions|rules|policy))?|confidentiality)$/i,
  ],
  [
    "ai",
    "data_handling",
    "Data-handling restrictions",
    /^data (?:handling|privacy)(?: (?:restrictions|rules|policy))?$/i,
  ],
  [
    "ai",
    "other_requirements",
    "Additional AI instructions",
    /^(?:ai(?: tool| usage)? (?:policy|rules|restrictions|instructions)|additional ai instructions)$/i,
  ],
];
const fieldId = (field) => field[0] + "." + field[1];
const blank = (value) =>
  Array.isArray(value)
    ? !value.some((item) => String(item).trim())
    : value == null || !String(value).trim();

function sameDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  ) {
    return date.toISOString().slice(0, 10);
  }
  return null;
}

function parseDate(value) {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const dates = new Set();
  for (const match of value.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g))
    dates.add(sameDate(...match.slice(1).map(Number)));
  for (const match of value.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s*,?\s+(20\d{2})\b/g,
  )) {
    const month = months.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    if (month) dates.add(sameDate(+match[3], month, +match[1]));
  }
  for (const match of value.matchAll(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(20\d{2})\b/g,
  )) {
    const month = months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
    if (month) dates.add(sameDate(+match[3], month, +match[2]));
  }
  dates.delete(null);
  if (
    dates.size !== 1 ||
    /\d\s*(?:–|—|\bto\b)\s*(?:\d|[A-Z][a-z]{2})/.test(value)
  )
    return "";
  return [...dates][0];
}

function cleanLine(line) {
  return line
    .trim()
    .replace(/^(?:#{1,6}\s+|[•*\-]\s+|\d{1,2}[.)]\s+)/, "")
    .replace(/^\*\*|\*\*(?=[:\s]*$)/g, "")
    .trim();
}

export function rulebookSuggestions(text, draft, source) {
  const blocks = new Map();
  let active;
  let nonemptyLines = 0;
  const deadlines = [];
  let inferredHackathonName;
  for (const original of text.split(/\r?\n/)) {
    const line = cleanLine(original);
    if (!line) continue;
    nonemptyLines++;
    if (
      nonemptyLines <= 4 &&
      line.length <= 120 &&
      /\bhackathon\b/i.test(line) &&
      !/[:.!?]|\b(?:rules?|guidelines?|handbook|about|welcome|organizers?)\b/i.test(
        line,
      ) &&
      !inferredHackathonName
    ) {
      inferredHackathonName = line;
    }
    const closing =
      /^(?:final )?submissions? (?:close(?:s)?|(?:is |are )?due|must be submitted) (?:on |by )?(.+)$/i.exec(
        line,
      );
    if (closing) deadlines.push(closing[1]);
    const inline = /^([^:—–]{2,85})(?:\s*:\s*|\s+[—–]\s+)(.*)$/.exec(line);
    const label = (inline?.[1] || line).replace(/\*\*/g, "").trim();
    const field = fieldDefinitions.find((item) => item[3].test(label));
    if (field) {
      active = fieldId(field);
      if (!blocks.has(active)) blocks.set(active, []);
      if (inline?.[2]) {
        blocks.get(active).push(inline[2]);
        if (
          !field[4] &&
          ![
            "description",
            "problem_statement",
            "workflow_content",
            "privacy_restrictions",
            "data_handling",
            "other_requirements",
          ].includes(field[1])
        )
          active = undefined;
      }
      continue;
    }
    if (
      /^\s*#{1,6}\s+/.test(original) ||
      /^(?:agenda|schedule|contact|organizers?|registration|eligibility|team size|prizes?|faq|resources|terms(?: and conditions)?)(?:\s*:.*)?$/i.test(
        line,
      )
    ) {
      active = undefined;
    } else if (active && blocks.get(active).length < 30) {
      blocks.get(active).push(line);
      if (
        /^project\.(?:name|hackathon_name|theme|repository|start_date|submission_deadline)$/.test(
          active,
        )
      )
        active = undefined;
    }
  }

  if (inferredHackathonName && !blocks.get("project.hackathon_name")?.length) {
    blocks.set("project.hackathon_name", [inferredHackathonName]);
  }
  if (deadlines.length && !blocks.has("project.submission_deadline"))
    blocks.set("project.submission_deadline", deadlines);
  return suggestionsFromBlocks(blocks, draft).map(suggestion => {
    if (!source) return suggestion;
    const values = blocks.get(suggestion.group + "." + suggestion.key) || [];
    const comparable = text => text.normalize("NFKC").replace(/\s+/g, " ").trim();
    const hits = (source.pages || []).filter(page => values.every(value =>
      comparable(page.text).includes(comparable(value))));
    return {...suggestion, source:{
      name:source.name,
      page:hits.length === 1 ? hits[0].number : null,
      quote:values.join(" ").slice(0,320),
      confidence:"Label match",
    }};
  });
}

export function scannedRulebookSuggestions(fields, draft) {
  const blocks = new Map();
  for (const field of fieldDefinitions) {
    const values = [
      ...new Set(
        fields
          .filter((item) => item.label === field[2])
          .map((item) => item.value.trim())
          .filter(Boolean),
      ),
    ];
    if (values.length === 1)
      blocks.set(
        fieldId(field),
        values[0].split(/\r?\n/).map(cleanLine).filter(Boolean),
      );
  }
  return suggestionsFromBlocks(blocks, draft);
}

function suggestionsFromBlocks(blocks, draft) {
  const suggestions = [];
  for (const field of fieldDefinitions) {
    const [group, key, label, , list] = field;
    if (!blank(draft[group]?.[key])) continue;
    const source = blocks.get(fieldId(field)) || [];
    if (!source.length) continue;
    let value = list
      ? [...new Set(source)]
          .join("\n")
          .slice(0, 1200)
          .split("\n")
          .filter(Boolean)
      : source.join("\n").slice(0, 1200);
    if (key === "start_date" || key === "submission_deadline")
      value = parseDate(source.join(" "));
    if (key === "repository") {
      const url = /^(?:https:\/\/github\.com\/)?([\w-]+\/[\w.-]+)\/?$/i.exec(
        value.trim(),
      );
      value = url ? url[1].replace(/\.git$/i, "") : "";
    }
    if (!blank(value)) suggestions.push({ group, key, label, value });
  }
  const start =
    draft.project?.start_date ||
    suggestions.find((item) => item.key === "start_date")?.value;
  const deadline =
    draft.project?.submission_deadline ||
    suggestions.find((item) => item.key === "submission_deadline")?.value;
  return start && deadline && start > deadline
    ? suggestions.filter(
        (item) => !["start_date", "submission_deadline"].includes(item.key),
      )
    : suggestions;
}

export function applyRulebookSuggestions(draft, suggestions) {
  const applied = [];
  for (const { group, key, label, value, source } of suggestions) {
    draft[group] ||= {};
    if (!blank(draft[group][key])) continue;
    draft[group][key] = value;
    if (source) {
      draft.sources ||= {};
      draft.sources[group + "." + key] = source;
    }
    if (key === "workflow_content") draft.project.workflow_status = "provided";
    applied.push(label);
  }
  return applied;
}

export async function readRulebook(file, { withPages = false } = {}) {
  if (file.size > rulebookLimit) throw Error("Choose a rulebook up to 8 MB.");
  if (/\.(txt|md)$/i.test(file.name)) {
    const text = (await file.text()).slice(0, 120000);
    return withPages ? {text, pages:[]} : text;
  }
  if (!/\.pdf$/i.test(file.name))
    throw Error("Choose a PDF, Markdown, or text file.");
  const pdfjs = await import("/rulebook-pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/rulebook-pdf.worker.mjs";
  const task = pdfjs.getDocument({
    data: await file.arrayBuffer(),
    isEvalSupported: false,
    useWasm: false,
    disableFontFace: true,
    disableWorkerRendering: true,
    useSystemFonts: true,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 50)
      throw Error(
        "This rulebook has over 50 pages. Paste the relevant sections.",
      );
    let extracted = "";
    const pages = [];
    for (
      let number = 1;
      number <= pdf.numPages && extracted.length < 120000;
      number++
    ) {
      const offset = extracted.length;
      const page = await pdf.getPage(number);
      const { items } = await page.getTextContent();
      let previousY;
      for (const item of items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (
          previousY !== undefined &&
          Math.abs(previousY - y) > 2 &&
          !extracted.endsWith("\n")
        )
          extracted += "\n";
        extracted += item.str + (item.hasEOL ? "\n" : " ");
        if (extracted.length >= 120000) break;
        previousY = y;
      }
      if (withPages) pages.push({number,text:extracted.slice(offset)});
      extracted += "\n";
    }
    if (!extracted.trim())
      throw Error(
        "This PDF has no readable text. Paste the relevant rules instead.",
      );
    const text = extracted.slice(0, 120000);
    return withPages ? {text,pages} : text;
  } catch (error) {
    if (error.name === "PasswordException")
      throw Error("This PDF is password-protected. Unlock it or paste the relevant text.");
    throw error;
  } finally {
    await task.destroy();
  }
}
