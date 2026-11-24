import { rulebookLimit } from "./lib/rulebook-limits.js";
import {
  applyRulebookSuggestions,
  readRulebook,
  rulebookSuggestions,
  scannedRulebookSuggestions,
} from "./rulebook-import.js";

import { supabase } from "./lib/supabase.js";

const scanTypes = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

async function scanRulebook(file, mime, progress) {
  if (!mime)
    throw Error("Use a PDF, JPEG, PNG, or WebP file for Gemini scanning.");
  if (file.size > rulebookLimit)
    throw Error("Choose a file up to 8 MB for Gemini scanning.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw Error("Sign in again to scan this file.");
  const headers = {
    "content-type": mime,
    authorization: "Bearer " + data.session.access_token,
  };
  let url = "/api/setup/rulebook";
  let body = file;
  if (file.size > 4 * 1024 * 1024) {
    const chunkSize = 3 * 1024 * 1024;
    const scanId = crypto.randomUUID();
    const parts = Math.ceil(file.size / chunkSize);
    for (let part = 0; part < parts; part++) {
      progress("Uploading " + (part + 1) + " of " + parts + " parts…");
      const response = await fetch(url + "/part?scan=" + scanId + "&part=" + part, {
        method: "POST", headers, signal: AbortSignal.timeout(20000),
        body: file.slice(part * chunkSize, (part + 1) * chunkSize, mime),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw Error(failure.error || "The rulebook upload failed. Try again.");
      }
    }
    url += "?scan=" + scanId + "&parts=" + parts;
    body = "";
  }
  progress("Finding deadlines and requirements…");
  const response = await fetch(url, {method:"POST", headers, body, signal:AbortSignal.timeout(75000)});
  if (response.status === 413) throw Error("The file exceeds the upload limit for this deployment.");
  const payload = await response.json();
  if (!response.ok)
    throw Error(payload.error || "Gemini couldn’t read this file.");
  return payload.fields;
}

export function openRulebookImport({ dialog, draft, escape, onApply }) {
  document.getElementById("shared-title").textContent =
    "Import hackathon rules";
  const body = document.getElementById("shared-dialog-body");
  body.innerHTML =
    '<form id="rulebook-input" class="shared-form">' +
    "<p>Upload a rulebook up to 8 MB or paste the rules.</p>" +
    '<label for="rulebook-file">Rulebook file</label><input id="rulebook-file" type="file" accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.webp">' +
    '<label for="rulebook-text">Or paste the rules</label><textarea id="rulebook-text" maxlength="120000" rows="8"></textarea>' +
    '<label><input id="rulebook-scan" type="checkbox">Use Gemini to read this PDF or photo</label>' +
    '<p class="shared-muted" id="rulebook-scan-detail">Use Gemini for scans and photos up to 8 MB. The selected file will be sent to Google. Text extraction runs in your browser when this option is off.</p>' +
    '<button class="button primary">Find details</button><p id="rulebook-status" role="status"></p></form><div id="rulebook-review"></div>';
  dialog.showModal();
  const form = body.querySelector("#rulebook-input");
  const review = body.querySelector("#rulebook-review");
  const status = body.querySelector("#rulebook-status");
  const scanDetail = body.querySelector("#rulebook-scan-detail");
  supabase.auth.getSession().then(({data}) => fetch("/api/setup/rulebook", {
    headers: data.session ? {authorization: "Bearer " + data.session.access_token} : {},
  })).then(async response => {
    if (response.ok && !(await response.json()).configured && scanDetail.isConnected) {
      scanDetail.textContent = "Scanning requires the site’s Gemini setup key. Text and text-based PDFs can still be imported in your browser.";
    }
  }).catch(() => {});

  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    const file = body.querySelector("#rulebook-file").files[0];
    const pasted = body.querySelector("#rulebook-text").value.trim();
    submit.disabled = true;
    review.replaceChildren();
    status.textContent = "Reading rulebook…";
    try {
      if (!file && !pasted) throw Error("Choose a file or paste some rules.");
      if (file && pasted)
        throw Error("Use either the uploaded file or the pasted text.");
      const extension = file?.name.split(".").pop().toLowerCase();
      const mime = Object.hasOwn(scanTypes, extension) ? scanTypes[extension] : null;
      const useGemini = body.querySelector("#rulebook-scan").checked;
      if (useGemini && !file)
        throw Error(
          "Attach a PDF or photo, or turn off Gemini to use pasted text.",
        );
      if (!useGemini && mime?.startsWith("image/"))
        throw Error("Select Use Gemini to read a photo.");
      const sourceName = file?.name || "Pasted rulebook text";
      let suggestions;
      if (useGemini) {
        const fields = await scanRulebook(file, mime, message => {status.textContent = message;});
        suggestions = scannedRulebookSuggestions(fields, draft).map(item => ({
          ...item, source:{name:sourceName, page:null, quote:"", confidence:"Unverified extraction"},
        }));
      } else {
        const extracted = file ? await readRulebook(file, {withPages:true}) : {text:pasted, pages:[]};
        status.textContent = "Checking deadlines and requirements…";
        suggestions = rulebookSuggestions(extracted.text, draft, {name:sourceName, pages:extracted.pages});
      }
      if (!dialog.open || !form.isConnected) return;
      if (!suggestions.length)
        throw Error(
          "No clear matches for blank fields. Try pasting the relevant headings and details, or fill those fields manually.",
        );
      status.textContent =
        suggestions.length +
        " suggested " +
        (suggestions.length === 1 ? "field." : "fields.");
      review.innerHTML =
        '<form id="rulebook-apply" class="shared-form"><h3>Review suggested details</h3>' +
        "<p>Uncheck any suggestion you want to leave blank. Review the remaining blanks and AI permissions in setup.</p>" +
        suggestions
          .map(
            (item, index) =>
              '<label class="rulebook-suggestion"><input name="suggestion" type="checkbox" checked value="' +
              index +
              '"><span><strong>' +
              escape(item.label) +
              "</strong><span>" +
              escape(
                Array.isArray(item.value) ? item.value.join("\n") : item.value,
              ) +
              '</span><small class="portal-citation">' +
              escape([item.source.name, item.source.page && "Page " + item.source.page, item.source.confidence].filter(Boolean).join(" · ")) +
              (item.source.quote ? '<q>' + escape(item.source.quote) + '</q>' : '') +
              "</small></span></label>",
          )
          .join("") +
        '<button class="button primary">Fill selected fields</button></form>';
      review.querySelector("form").onsubmit = async (applyEvent) => {
        applyEvent.preventDefault();
        const selected = [
          ...applyEvent.currentTarget.querySelectorAll("input:checked"),
        ].map((input) => suggestions[Number(input.value)]);
        if (!selected.length) {
          status.textContent = "Select at least one suggestion.";
          return;
        }
        applyEvent.submitter.disabled = true;
        const labels = applyRulebookSuggestions(draft, selected);
        dialog.close();
        await onApply(labels);
      };
    } catch (error) {
      status.textContent =
        error.message ===
        "This PDF has no readable text. Paste the relevant rules instead."
          ? "This PDF appears to be scanned. Select Use Gemini, or paste the relevant rules."
          : error.message || "Could not read those rules.";
    } finally {
      submit.disabled = false;
    }
  };
}
