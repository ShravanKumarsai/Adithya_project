const styles = ["blueprint", "light", "dark", "system"];
const accents = ["blue", "green", "amber", "rose"];
const sizes = ["small", "medium", "large"];
export function studioAppearance() {
  return {
    theme: styles.includes(localStorage.getItem("aithya.theme"))
      ? localStorage.getItem("aithya.theme")
      : "system",
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
  const theme = styles.includes(p.theme) ? p.theme : "system";
  root.dataset.blueprint = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  root.dataset.accent = accents.includes(p.accent) ? p.accent : "blue";
  root.dataset.icon = sizes.includes(p.icon) ? p.icon : "medium";
  for (const [key, value] of [
    ["theme", theme],
    ["accent", root.dataset.accent],
    ["icon", root.dataset.icon],
  ])
    localStorage.setItem("aithya." + key, value);
}
