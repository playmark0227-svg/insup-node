import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productionCsp, verifyArtifacts } from "../scripts/security-artifacts.mjs";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "insup-public-security-"));
  t.after(() => rmSync(dir, {recursive:true,force:true}));
  const html = `<!doctype html><head><meta http-equiv="Content-Security-Policy" content="${productionCsp}" /><meta name="referrer" content="no-referrer" /></head><script type="module" src="./assets/app.js"></script>`;
  writeFileSync(join(dir,"index.html"),html);
  return {dir,html};
}

test("production artifact policy rejects executable inline scripts and excludes dev-only allowances", t => {
  const {dir,html} = fixture(t);
  assert.deepEqual(verifyArtifacts(dir),{checkedFiles:1});
  assert.match(productionCsp,/script-src 'self';/);
  assert.doesNotMatch(productionCsp,/unsafe-eval|script-src[^;]*unsafe-inline|http:|ws:|frame-ancestors/);
  assert.match(productionCsp,/object-src 'none'/);
  assert.match(productionCsp,/form-action 'none'/);
  for (const unsafe of [html.replace("script-src 'self'", "script-src *"),html+"<script>alert('bad')</script>",html+'<script src="https://evil.example/app.js"></script>',html.replace('content="no-referrer"','content="origin"')]) {
    writeFileSync(join(dir,"index.html"),unsafe);
    assert.throws(() => verifyArtifacts(dir));
  }
});

test("artifact guard catches actual secret patterns and only reports filenames, never values", t => {
  const {dir} = fixture(t), key = "AIza"+"a".repeat(35);
  writeFileSync(join(dir,"leak.js"),`const key="${key}";`);
  assert.throws(() => verifyArtifacts(dir), error => {
    assert.match(error.message,/leak\.js: Google API key/); assert.ok(!error.message.includes(key)); return true;
  });
});

test("artifact guard rejects credential/debug files and symlinks into private data", t => {
  const {dir} = fixture(t);
  writeFileSync(join(dir,".env.local"),"SECRET=private-value");
  writeFileSync(join(dir,"app.js.map"),"{}");
  symlinkSync(join(dir,"index.html"),join(dir,"private-link"));
  assert.throws(() => verifyArtifacts(dir), /private or debug file[\s\S]*symbolic link/);
});

test("public entrypoint keeps referrer protection and security build gate", () => {
  const html = readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const finalize = readFileSync(new URL("../scripts/finalize-pages.mjs",import.meta.url),"utf8");
  assert.match(html,/<meta name="referrer" content="no-referrer"/);
  assert.match(finalize,/verifyArtifacts\("docs"\)/);
});

test("dependency lock is portable and matches the declared security-fixed Vite version", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json",import.meta.url),"utf8"));
  assert.deepEqual(lock.packages[""].dependencies,manifest.dependencies);
  assert.deepEqual(lock.packages[""].devDependencies,manifest.devDependencies);
  for (const [path,entry] of Object.entries(lock.packages)) {
    assert.ok(!path.startsWith("../"),"Lock may not refer to a sibling checkout.");
    assert.ok(!entry.link,"Lock may not depend on local node_modules symlinks.");
    if (entry.resolved) assert.match(entry.resolved,/^https:\/\/registry\.npmjs\.org\//);
  }
  assert.equal(lock.packages["node_modules/vite"].version,manifest.devDependencies.vite);
});
