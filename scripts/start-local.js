const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function loadEnvFromFile(envPath) {
  if (!fs.existsSync(envPath) || fs.statSync(envPath).isDirectory()) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFromFile(path.join(ROOT, ".env"));
loadEnvFromFile(path.join(ROOT, ".env", "env.txt"));

const { spawn } = require("child_process");

const child = spawn(process.execPath, [path.join(ROOT, "server", "index.js")], {
  cwd: ROOT,
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code) => process.exit(code ?? 0));
