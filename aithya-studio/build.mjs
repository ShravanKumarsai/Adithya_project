import { build } from "esbuild";
import { cp, mkdir, readFile, readdir } from "node:fs/promises";

await build({
  entryPoints: ["src/shared.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  external: ["/rulebook-pdf.mjs"],
  outfile: "ui/shared.bundle.js",
  target: ["es2022"],
  minify: true,
});

const assets = {
  "/shared": ["ui/shared.html", "text/html"],
  "/shared.css": ["ui/shared.css", "text/css"],
  "/shared.bundle.js": ["ui/shared.bundle.js", "text/javascript"],
  "/studio.webmanifest": ["ui/studio.webmanifest", "application/manifest+json"],
  "/claude-credit-sync.txt": ["scripts/claude-credit-sync.py", "text/plain"],
  "/ai-credit-connector.txt": ["scripts/ai-credit-connector.py", "text/plain"],
  "/rulebook-pdf.mjs": ["node_modules/pdfjs-dist/legacy/build/pdf.min.mjs", "text/javascript"],
  "/rulebook-pdf.worker.mjs": ["node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs", "text/javascript"],
  "/rulebook-pdf.LICENSE.txt": ["node_modules/pdfjs-dist/LICENSE", "text/plain"],
};
const entries = await Promise.all(
  Object.entries(assets).map(async ([route, [file, type]]) =>
    [route, [type + "; charset=utf-8", await readFile(file, "utf8")]],
  ),
);

for (const size of [192, 512]) {
  const file = "icons/studio-" + size + ".png";
  entries.push(["/" + file, ["image/png", (await readFile("ui/" + file)).toString("base64"), true]]);
}

const prompts = await Promise.all(
  (await readdir("prompts"))
    .filter((file) => file.endsWith(".json"))
    .map(async (file) => JSON.parse(await readFile("prompts/" + file, "utf8"))),
);
if (
  !prompts.length ||
  new Set(prompts.map((prompt) => prompt.id)).size !== prompts.length ||
  prompts.some((prompt) =>
    !["id", "name", "description", "instruction"].every(
      (field) => typeof prompt[field] === "string" && prompt[field].trim(),
    ),
  )
) throw new Error("Planning prompt files must have unique IDs and complete fields.");

await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/drizzle", { recursive: true });
await build({
  entryPoints: ["worker.mjs"],
  outfile: "dist/server/index.js",
  format: "esm",
  bundle: true,
  platform: "neutral",
  target: ["es2022"],
  plugins: [{
    name: "studio-assets",
    setup(builder) {
      builder.onResolve({ filter: /^studio:assets$/ }, ({ path }) =>
        ({ path, namespace: "studio-assets" }));
      builder.onLoad({ filter: /.*/, namespace: "studio-assets" }, () =>
        ({ contents: "export const assets = " + JSON.stringify(Object.fromEntries(entries)), loader: "js" }));
    },
  }],
});
