import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { productionCsp, verifyArtifacts } from "./security-artifacts.mjs";
writeFileSync("docs/.nojekyll", "");
mkdirSync("docs/apps-script", { recursive: true });
for (const file of ["Code.gs", "Migrate.gs", "MIGRATION.md", "appsscript.json", "SETUP.md", "AI-SETUP.md"])
  copyFileSync(`google-apps-script/${file}`, `docs/apps-script/${file}`);
const index = readFileSync("docs/index.html", "utf8");
const marker = "<!-- Production CSP is inserted here by finalize-pages.mjs after Vite builds. -->";
if (!index.includes(marker)) throw new Error("Production CSP marker is missing.");
writeFileSync("docs/index.html", index.replace(marker, `<meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`));
const result = verifyArtifacts("docs");
console.log(`Public artifact security check passed (${result.checkedFiles} files).`);
