export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

export const button = (id, label, primary = false) =>
  '<button type="button" class="button ' +
  (primary ? "primary" : "subtle") +
  '" id="' +
  escape(id) +
  '">' +
  escape(label) +
  "</button>";

export const skeleton = (label) =>
  '<div class="studio-skeleton" role="status"><span class="studio-sr">' +
  escape(label) +
  '</span><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i></div>';

export function tabButton(id, label, active, panel, icon = "") {
  return (
    '<button type="button" role="tab" id="' +
    escape(id) +
    '" aria-controls="' +
    escape(panel) +
    '" aria-selected="' +
    active +
    '" tabindex="' +
    (active ? "0" : "-1") +
    '">' +
    icon +
    escape(label) +
    "</button>"
  );
}

export function tabKeys(list) {
  list.addEventListener("keydown", (event) => {
    const keys = { ArrowLeft: -1, ArrowRight: 1, Home: "first", End: "last" };
    if (!Object.hasOwn(keys, event.key)) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(event.target);
    if (current === -1) return;
    event.preventDefault();
    const key = keys[event.key];
    const next =
      key === "first"
        ? 0
        : key === "last"
          ? tabs.length - 1
          : (current + key + tabs.length) % tabs.length;
    tabs[next].click();
  });
}
