export const themeOptions = [
  ["light", "Light"], ["blueprint", "Blueprint"],
  ["deep-blue", "Deep Blue Blueprint"], ["graphite", "Graphite Blueprint"],
];
const styles = themeOptions.map(([value]) => value);
const accents = ["blue", "green", "amber", "rose"];
const sizes = ["small", "medium", "large"];
export function preferredTheme() {
  const saved = localStorage.getItem("aithya.theme");
  return styles.includes(saved) ? saved : null;
}
export function studioAppearance() {
  return {
    theme: preferredTheme() || "blueprint",
    accent: accents.includes(localStorage.getItem("aithya.accent"))
      ? localStorage.getItem("aithya.accent")
      : "blue",
    icon: sizes.includes(localStorage.getItem("aithya.icon"))
      ? localStorage.getItem("aithya.icon")
      : "medium",
  };
}
export function applyStudioAppearance(p = studioAppearance(), {remember = true} = {}) {
  const root = document.documentElement;
  const theme = styles.includes(p.theme) ? p.theme : "light";
  root.dataset.blueprint = theme;
  root.dataset.accent = accents.includes(p.accent) ? p.accent : "blue";
  root.dataset.icon = sizes.includes(p.icon) ? p.icon : "medium";
  if (!remember) return;
  for (const [key, value] of [
    ["theme", theme],
    ["accent", root.dataset.accent],
    ["icon", root.dataset.icon],
  ])
    localStorage.setItem("aithya." + key, value);
}
