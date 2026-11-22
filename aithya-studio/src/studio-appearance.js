const styles = ["blueprint", "light", "dark"];
const accents = ["blue", "green", "amber", "rose"];
const sizes = ["small", "medium", "large"];
export function studioAppearance() {
  return {
    theme: styles.includes(localStorage.getItem("aithya.theme"))
      ? localStorage.getItem("aithya.theme")
      : "blueprint",
    accent: accents.includes(localStorage.getItem("aithya.accent"))
      ? localStorage.getItem("aithya.accent")
      : "blue",
    icon: sizes.includes(localStorage.getItem("aithya.icon"))
      ? localStorage.getItem("aithya.icon")
      : "medium",
  };
}
export function applyStudioAppearance(p = studioAppearance()) {
  const root = document.documentElement;
  root.dataset.blueprint = styles.includes(p.theme) ? p.theme : "blueprint";
  root.dataset.accent = accents.includes(p.accent) ? p.accent : "blue";
  root.dataset.icon = sizes.includes(p.icon) ? p.icon : "medium";
  for (const [key, value] of [
    ["theme", root.dataset.blueprint],
    ["accent", root.dataset.accent],
    ["icon", root.dataset.icon],
  ])
    localStorage.setItem("aithya." + key, value);
}
