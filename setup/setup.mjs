#!/usr/bin/env node
// anyrea — connect REA (morluto/rea, MIT) to any agent.
// Zero dependencies. Node >= 20. Writes MCP registrations and installs the
// reverse-engineer-anything skill without ever running REA's own setup.
//   node setup/setup.mjs [--agent <id>] [--skill-only] [--no-skill]
//                        [--pin <version>] [--strict] [--dry-run]

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, rmSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_SRC = join(REPO_ROOT, "skill");
const SKILL_NAME = "reverse-engineer-anything";
const HOME = homedir();
const IS_WIN = platform() === "win32";
const NOW = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// REA's supported Node range (package.json engines): ^22.23.4 || ^24.22.1 || >=26.12.1
const SUPPORTED_NODE = { 22: "22.23.4", 24: "24.22.1", 26: "26.12.1" };
const UNSUPPORTED_MAJOR = [23, 25]; // skipped odd-numbered lines

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const has = (name) => args.includes(name);

const ONLY_AGENT = flag("--agent");
const PIN = flag("--pin");
const SKILL_ONLY = has("--skill-only");
const NO_SKILL = has("--no-skill");
const STRICT = has("--strict");
const DRY = has("--dry-run");

const p = (m) => process.stdout.write(m + "\n");
const die = (m) => {
  process.stderr.write(m + "\n");
  process.exit(1);
};

if (has("--help") || has("-h")) {
  p(`anyrea — connect REA (morluto/rea) to any agent.

Usage:
  node setup/setup.mjs [--agent <id>] [flags]

Flags:
  --agent <id>   Target one client (see ids below); default: every client whose
                 config file already exists on this machine.
  --skill-only   Only install the skill; do not touch MCP configs.
  --no-skill     Only write MCP registrations; do not install the skill.
  --pin <ver>    Register rea-agents@<ver> instead of latest.
  --strict       Exit 1 (instead of warning) on an unsupported Node version.
  --dry-run      Print what would happen; write nothing.

Clients:
  claude, claude-desktop, codex, cursor, windsurf, gemini, opencode,
  cline, zed, agents (shared ~/.agents/mcp.json — ZCode / FreeBuff),
  generic (prints the JSON entry; you paste it anywhere).

Examples:
  node setup/setup.mjs --dry-run
  node setup/setup.mjs --agent claude
  node setup/setup.mjs --skill-only --pin 6.8.0`);
  process.exit(0);
}

// ---------------------------------------------------------------- engine check

function nodeSupported() {
  const [major, minor, patch] = process.version.replace(/^v/, "").split(".").map(Number);
  const floor = SUPPORTED_NODE[major];
  if (floor !== undefined) {
    const [fMin, fPatch] = floor.split(".").slice(1).map(Number);
    return minor === fMin ? patch >= fPatch : minor > fMin;
  }
  // 23 and 25 are unsupported lines; anything newer than 26 qualifies.
  return !UNSUPPORTED_MAJOR.includes(major) && major > 26;
}

function engineCheck() {
  if (nodeSupported()) return;
  const [major, minor, patch] = process.version.replace(/^v/, "").split(".").map(Number);
  p(`[warn] Node v${major}.${minor}.${patch} is outside REA's supported range
  (^22.23.4 || ^24.22.1 || >=26.12.1). REA's own setup refuses this version;
  anyrea continues, and the MCP server will likely still run. To be safe:
  upgrade via https://nodejs.org (or: nvm install --lts / fnm use --install).`);
  if (STRICT) die("anyrea: --strict set; refusing to continue on unsupported Node.");
}

// ---------------------------------------------------------------- server entry

function serverArgs() {
  const pkg = PIN ? `rea-agents@${PIN}` : "rea-agents";
  return ["-y", pkg, "mcp"];
}

// JSON-dialect `mcpServers` entries. On Windows, npx is a .cmd shim, so the
// reliable form is `cmd /c npx ...` (the form Claude Desktop documents).
function jsonServerEntry() {
  const a = serverArgs();
  return IS_WIN ? { command: "cmd", args: ["/c", "npx", ...a] } : { command: "npx", args: a };
}

function opencodeEntry() {
  const a = serverArgs();
  const command = IS_WIN ? ["cmd", "/c", "npx", ...a] : ["npx", ...a];
  return { type: "local", command, enabled: true };
}

// ---------------------------------------------------------------- targets

// kind: "mcpServers" (JSON with a mcpServers map), "opencode" (JSON with a mcp map),
// "zed" (JSON context_servers), "toml" (codex), "print" (generic — no write).
const TARGETS = [
  { id: "claude", label: "Claude Code", kind: "mcpServers", home: () => join(HOME, ".claude"),
    config: () => join(HOME, ".claude.json"),
    skills: () => join(HOME, ".claude", "skills") },
  { id: "claude-desktop", label: "Claude Desktop", kind: "mcpServers",
    config: () => IS_WIN
      ? join(HOME, "AppData", "Roaming", "Claude", "claude_desktop_config.json")
      : join(HOME, "Library", "Application Support", "Claude", "claude_desktop_config.json") },
  { id: "codex", label: "Codex", kind: "toml", home: () => join(HOME, ".codex"),
    config: () => join(HOME, ".codex", "config.toml") },
  { id: "cursor", label: "Cursor", kind: "mcpServers", home: () => join(HOME, ".cursor"),
    config: () => join(HOME, ".cursor", "mcp.json") },
  { id: "windsurf", label: "Windsurf", kind: "mcpServers", home: () => join(HOME, ".codeium"),
    config: () => join(HOME, ".codeium", "windsurf", "mcp.json") },
  { id: "gemini", label: "Gemini CLI", kind: "mcpServers", home: () => join(HOME, ".gemini"),
    config: () => join(HOME, ".gemini", "settings.json"),
    skills: () => join(HOME, ".agents", "skills") }, // upstream shares this dir with FreeBuff/ZCode
  { id: "opencode", label: "opencode", kind: "opencode", home: () => join(HOME, ".config", "opencode"),
    config: () => join(HOME, ".config", "opencode", "opencode.json") },
  { id: "cline", label: "Cline (VS Code)", kind: "mcpServers",
    config: () => IS_WIN
      ? join(HOME, "AppData", "Roaming", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
      : platform() === "darwin"
        ? join(HOME, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
        : join(HOME, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json") },
  { id: "zed", label: "Zed", kind: "zed", home: () => join(HOME, ".config", "zed"),
    config: () => join(HOME, ".config", "zed", "settings.json") },
  { id: "zcode", label: "ZCode", kind: "mcpServers", home: () => join(HOME, ".zcode", "cli"),
    config: () => join(HOME, ".agents", "mcp.json"), // REA's documented ZCode fallback registration path
    skills: () => [join(HOME, ".zcode", "skills"), join(HOME, ".agents", "skills")] },
  { id: "agents", label: "shared ~/.agents (FreeBuff)", kind: "mcpServers", home: () => join(HOME, ".agents"),
    config: () => join(HOME, ".agents", "mcp.json"),
    skills: () => join(HOME, ".agents", "skills") },
];

// An agent counts as present when its MCP config or its home directory exists.
function detected(t) {
  return existsSync(t.config()) || (t.home && existsSync(t.home()));
}

// ---------------------------------------------------------------- io helpers

function backup(target, dry) {
  const bak = `${target}.anyrea-${NOW}.bak`;
  p(`  backup: ${bak}`);
  if (dry) return;
  if (statSync(target).isDirectory()) cpSync(target, bak, { recursive: true });
  else copyFileSync(target, bak);
}

function writeJson(file, data, dry) {
  if (dry) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// Insert/replace the `rea` entry in a JSON config; returns "created"|"updated"|"unchanged".
function upsertJson(file, build) {
  if (!existsSync(file)) {
    p(`  create: ${file}`);
    writeJson(file, build({}), DRY);
    return "created";
  }
  const data = readJson(file);
  const fresh = build(data);
  if (!fresh) return "unchanged";
  backup(file, DRY);
  writeJson(file, data, DRY);
  return "updated";
}

function sameEntry(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ---------------------------------------------------------------- writers

function writeMcpServers(t) {
  const fresh = jsonServerEntry();
  return upsertJson(t.config(), (data) => {
    data.mcpServers ??= {};
    if (sameEntry(data.mcpServers.rea, fresh)) return null;
    data.mcpServers.rea = fresh;
    return fresh;
  });
}

function writeOpencode(t) {
  const fresh = opencodeEntry();
  return upsertJson(t.config(), (data) => {
    data.mcp ??= {};
    if (sameEntry(data.mcp.rea, fresh)) return null;
    data.mcp.rea = fresh;
    return fresh;
  });
}

function writeZed(t) {
  const fresh = { ...jsonServerEntry(), env: {} };
  return upsertJson(t.config(), (data) => {
    data.context_servers ??= {};
    const current = data.context_servers.rea;
    if (current && current.source === "custom" &&
        current.command === fresh.command && sameEntry(current.args, fresh.args)) return null;
    data.context_servers.rea = { source: "custom", ...fresh };
    return fresh;
  });
}

function writeCodexToml(t) {
  const file = t.config();
  const a = serverArgs();
  const block = `[mcp_servers.rea]\ncommand = "npx"\nargs = [${a.map((s) => `"${s}"`).join(", ")}]\n`;
  if (!existsSync(file)) {
    p(`  create: ${file}`);
    if (!DRY) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, block); }
    return "created";
  }
  const text = readFileSync(file, "utf8");
  if (/^\[mcp_servers\.rea\]$/m.test(text)) {
    const next = text.replace(/\[mcp_servers\.rea\][\s\S]*?(?=\n\[|\s*$)/, block.trimEnd());
    if (next === text) return "unchanged";
    backup(file, DRY);
    if (!DRY) writeFileSync(file, next);
    return "updated";
  }
  backup(file, DRY);
  if (!DRY) writeFileSync(file, text.replace(/\s*$/, "") + "\n\n" + block);
  return "updated";
}

function printGeneric() {
  p("  paste this entry into your agent's MCP configuration (mcpServers):");
  p("  " + JSON.stringify({ rea: jsonServerEntry() }));
  p(`  and copy ${SKILL_SRC} into the agent's skills folder.`);
}

// ---------------------------------------------------------------- skill

function installSkill(skillsDirs) {
  for (const skillsDir of [skillsDirs].flat()) {
    const dest = join(skillsDir, SKILL_NAME);
    const marker = join(dest, "SKILL.md");
    if (existsSync(marker) && readFileSync(marker, "utf8") === readFileSync(join(SKILL_SRC, "SKILL.md"), "utf8")) {
      p(`  skill:  ${dest} (already current)`);
      continue;
    }
    if (existsSync(dest)) {
      backup(dest, DRY);
      if (!DRY) rmSync(dest, { recursive: true, force: true });
    }
    p(`  skill:  ${dest}`);
    if (!DRY) {
      mkdirSync(skillsDir, { recursive: true });
      cpSync(SKILL_SRC, dest, { recursive: true });
    }
  }
}

// ---------------------------------------------------------------- main

engineCheck();

if (ONLY_AGENT === "generic") {
  p("generic: no files written.");
  printGeneric();
  process.exit(0);
}

const plan = ONLY_AGENT ? TARGETS.filter((t) => t.id === ONLY_AGENT) : TARGETS;
if (ONLY_AGENT && plan.length === 0) die(`anyrea: unknown client '${ONLY_AGENT}'. See --help for ids.`);

const summary = [];
for (const t of plan) {
  p(`\n${t.label} (${t.id})`);

  if (!SKILL_ONLY) {
    if (existsSync(t.config()) || ONLY_AGENT) {
      const writer = { mcpServers: writeMcpServers, opencode: writeOpencode, zed: writeZed, toml: writeCodexToml }[t.kind];
      summary.push([t.label, writer(t)]);
    } else {
      p(`  skip:   config not found (agent not detected); use --agent ${t.id} to force`);
    }
  }

  if (NO_SKILL) p("  skill:  skipped (--no-skill)");
  else if (detected(t) && t.skills) installSkill(t.skills());
  else if (detected(t)) p(`  skill:  no standard skills folder for this client — copy ${SKILL_SRC} manually`);
  else p("  skill:  agent not detected — skipped");
}

p("\nSummary:");
for (const [label, outcome] of summary) p(`  ${label}: ${outcome}`);
if (DRY) p("\n(dry run — nothing was written)");
