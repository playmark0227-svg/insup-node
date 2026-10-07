import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
writeFileSync("docs/.nojekyll", "");
mkdirSync("docs/apps-script", { recursive: true });
for (const file of ["Code.gs", "Migrate.gs", "MIGRATION.md", "appsscript.json", "SETUP.md"])
  copyFileSync(`google-apps-script/${file}`, `docs/apps-script/${file}`);
