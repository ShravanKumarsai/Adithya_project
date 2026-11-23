import {cp, mkdir, rm} from "node:fs/promises";

const output = "public-vercel";
await rm(output, {recursive:true, force:true});
await mkdir(output);
await mkdir(output + "/icons");
const assets = {
  "ui/studio.webmanifest":"studio.webmanifest",
  "ui/icons/studio-192.png":"icons/studio-192.png",
  "ui/icons/studio-512.png":"icons/studio-512.png",
  "ui/shared.html":"index.html",
  "ui/style.css":"style.css",
  "ui/shared.css":"shared.css",
  "ui/print.css":"print.css",
  "scripts/claude-credit-sync.py":"claude-credit-sync.txt",
  "scripts/ai-credit-connector.py":"ai-credit-connector.txt",
  "ui/shared.bundle.js":"shared.bundle.js",
  "node_modules/pdfjs-dist/legacy/build/pdf.min.mjs":"rulebook-pdf.mjs",
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs":"rulebook-pdf.worker.mjs",
  "node_modules/pdfjs-dist/LICENSE":"rulebook-pdf.LICENSE.txt",
};
await Promise.all(Object.entries(assets).map(([source, target]) => cp(source, output + "/" + target)));
