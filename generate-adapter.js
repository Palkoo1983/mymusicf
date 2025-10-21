/* generate-adapter.js – rugalmas betöltő több lehetséges útvonalhoz
   Próbálkozási sorrend:
   1) ./enzenem-generate.js
   2) ./generate.js
   3) ./src/generate.js
*/
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const candidates = [
  "./enzenem-generate.js",
  "./generate.js",
  "./src/generate.js"
];

let cachedMod = null;

async function loadFirstAvailable() {
  for (const rel of candidates) {
    const abs = path.resolve(__dirname, rel);
    if (fs.existsSync(abs)) {
      try {
        const url = pathToFileURL(abs).href;
        const mod = await import(url);
        if (mod && typeof mod.generateLyrics === "function") {
          return mod;
        }
      } catch {}
    }
  }
  throw new Error("No generate module found (enzenem-generate.js / generate.js / src/generate.js).");
}

export async function generateLyrics(args) {
  if (!cachedMod) cachedMod = await loadFirstAvailable();
  return cachedMod.generateLyrics(args);
}
