# anyrea

Reverse engineering from the AI agent you already have.

[REA (Reverse Engineer Anything)](https://github.com/morluto/rea) is an MCP
server that lets an agent inspect native binaries, Electron and JavaScript
apps, .NET assemblies, Android packages, and websites — decompile code, trace
features down to the binary level, and show the evidence. Its own setup, though,
ships the server and workflow instructions only to the clients it knows, ships
plugins only to Claude Code and Codex, and refuses to run at all on a Node
version outside its supported range.

anyrea is the bridge that skips all of that: it registers REA's MCP server
with any agent that reads MCP configuration, installs the
`reverse-engineer-anything` workflow skill into any agent that reads
`SKILL.md` files, and on an unsupported Node version it *warns with a fix*
instead of refusing — because the server itself usually runs fine.

Adapted from [morluto/rea](https://github.com/morluto/rea) (MIT), repackaged
as an agent-native bridge and skill: no plugin manager, no specific CLI, no
gated setup.

## Install

Clone this repository and run the bridge (Node 20+, zero dependencies):

```bash
git clone https://github.com/ahmedmetered/anyrea
cd anyrea
node setup/setup.mjs --dry-run   # preview what it would write
node setup/setup.mjs             # write registrations + install the skill
```

Or skip the bridge entirely: copy `skill/` into your agent's skills folder and
add this entry to the agent's MCP configuration (`mcpServers`):

```json
{ "rea": { "command": "npx", "args": ["-y", "rea-agents", "mcp"] } }
```

On Windows, use `cmd /c npx -y rea-agents mcp` as the command.

## Use

Restart your agent, then ask it:

- "Understand how search works in the Notes app, show me the evidence, and build
  a similar feature for my project."
- "Decompile this binary and explain what the license check does."
- "Compare how v1 and v2 of this Electron app handle offline sync."

The skill tells the agent when REA is the right tool, how to drive its tools,
and how to read the evidence — the server does the analysis.

## What the bridge writes

| Client | MCP registration | Skill |
| --- | --- | --- |
| Claude Code | `~/.claude.json` | `~/.claude/skills` |
| ZCode | `~/.agents/mcp.json` (REA's documented fallback path) | `~/.zcode/skills` + `~/.agents/skills` |
| Codex | `~/.codex/config.toml` | — |
| Cursor | `~/.cursor/mcp.json` | — |
| Windsurf | `~/.codeium/windsurf/mcp.json` | — |
| Gemini CLI | `~/.gemini/settings.json` | `~/.agents/skills` |
| opencode | `~/.config/opencode/opencode.json` | — |
| Cline (VS Code) | `cline_mcp_settings.json` | — |
| Zed | `settings.json` in `~/.config/zed` (`%APPDATA%\Zed` on Windows) | — |
| FreeBuff | `~/.agents/mcp.json` | `~/.agents/skills` |
| anything else | `--agent generic` prints the entry to paste | copy `skill/` manually |

Behavior details:

- By default only agents already present on the machine are touched; their
  existing files are backed up (`*.anyrea-<timestamp>.bak`) before any change.
- Re-running is safe: unchanged entries are left alone.
- `--agent <id>` targets one client and creates its config even if new.
- `--pin <version>` registers `rea-agents@<version>` instead of latest.
- `--strict` restores REA's refusal on unsupported Node versions, if you want it.

## The Node version rule

REA requires `^22.23.4 || ^24.22.1 || >=26.12.1`, and its own setup refuses
anything else before doing any work. anyrea warns, points you at the upgrade,
and continues — the MCP server very often runs fine outside the advertised
range, and you can decide whether to upgrade Node yourself.

## Files

```
SKILL.md            root entry describing the bridge
skill/SKILL.md      the reverse-engineering workflow (adapted, MIT)
skill/references/   per-target guides: native, JavaScript, Android, runtime, evidence
setup/setup.mjs     the zero-dependency bridge
```

## Credits and license

MIT. The workflow skill is adapted from the
[`reverse-engineer-anything` skill](https://github.com/morluto/rea) by the REA
contributors, and the MCP server it drives — all of the actual analysis — is
[REA](https://github.com/morluto/rea) (MIT). anyrea only wires it to your agent.
Independent project; not affiliated with or endorsed by the REA authors or any
agent vendor.
