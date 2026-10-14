import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

// GitHub Pages does not allow custom response headers. This meta CSP protects
// loaded resources; frame-ancestors/HSTS must be set by a future hosting proxy.
// React uses inline styles for progress bars and dialogs, so only style-src
// permits inline content. Executable inline scripts/eval remain blocked.
export const productionCsp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "font-src 'self'", "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'",
  "media-src 'none'", "manifest-src 'self'", "upgrade-insecure-requests",
].join("; ");

const secrets = [
  ["Google API key", /AIza[A-Za-z0-9_-]{30,}/],
  ["GitHub access token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Stripe secret", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}\b/],
  ["credential export", /"(?:private_key|client_secret|refresh_token)"\s*:\s*"[^"\n]{8,}"/],
];
const textExtensions = /\.(?:html?|js|mjs|cjs|css|json|gs|md|txt|xml|ya?ml)$/i;
const forbiddenName = /^(?:\.env(?:\..*)?|credentials(?:\.[^/]*)?|service[-_]?account(?:\.[^/]*)?|.*\.(?:pem|key|p12|pfx|map))$/i;

export function verifyArtifacts(directory) {
  const root = resolve(directory), failures = [], files = [];
  const walk = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = resolve(path, entry.name), label = relative(root, file);
      if (entry.isSymbolicLink() || lstatSync(file).isSymbolicLink()) { failures.push(`${label}: symbolic link`); continue; }
      if (forbiddenName.test(entry.name)) { failures.push(`${label}: private or debug file`); continue; }
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        files.push(label);
        if (textExtensions.test(entry.name)) {
          const content = readFileSync(file, "utf8");
          for (const [name, pattern] of secrets) if (pattern.test(content)) failures.push(`${label}: ${name}`);
        }
      }
    }
  };
  walk(root);
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  if (!html.includes(`<meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`)) failures.push("index.html: production CSP missing or changed");
  if (!/<meta name="referrer" content="no-referrer"\s*\/?>/.test(html)) failures.push("index.html: no-referrer missing");
  if (/<script\b[^>]*\bsrc=["'](?:https?:|\/\/|data:|javascript:)/i.test(html) || /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html)) failures.push("index.html: external or inline executable script");
  if (failures.length) throw new Error(`Public artifact security check failed:\n${failures.join("\n")}`);
  return { checkedFiles: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyArtifacts(process.argv[2] || "docs");
  console.log(`Public artifact security check passed (${result.checkedFiles} files).`);
}
