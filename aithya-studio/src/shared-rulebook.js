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

async function scanRulebook(file, mime) {
  if (!mime)
    throw Error("Use a PDF, JPEG, PNG, or WebP file for Gemini scanning.");
  if (file.size > 8 * 1024 * 1024)
    throw Error("Choose a file up to 8 MB for Gemini scanning.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw Error("Sign in again to scan this file.");
  const response = await fetch("/api/setup/rulebook", {
    method: "POST",
    headers: {
      "content-type": mime,
      authorization: "Bearer " + data.session.access_token,
    },
    body: file,
  });
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
    "<p>Upload a PDF, photo, Markdown, or text file, or paste the rules.</p>" +
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
  fetch("/api/setup/rulebook").then(async response => {
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
    status.textContent = "Reading the rules…";
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
      const suggestions = useGemini
        ? scannedRulebookSuggestions(await scanRulebook(file, mime), draft)
        : rulebookSuggestions(file ? await readRulebook(file) : pasted, draft);
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
              "</span></span></label>",
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
