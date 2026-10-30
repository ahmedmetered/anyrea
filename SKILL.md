---
name: anyrea
description: Reverse engineering from the AI agent you already have — connects the REA MCP server (morluto/rea, MIT) to any agent and installs the reverse-engineer-anything skill. Use for native binaries, Electron/JavaScript apps, .NET assemblies, firmware, and websites; skip for ordinary source-repository analysis.
---

# anyrea

anyrea is the agent-agnostic front door to [REA (Reverse Engineer
Anything)](https://github.com/morluto/rea). It does two things, and nothing else:

1. **Connects the server.** `node setup/setup.mjs` writes a stdio MCP entry
   (`npx -y rea-agents mcp`) into the MCP configuration of the agents it finds —
   including agents REA's own setup does not cover — backing up any existing
   `rea` entry first.
2. **Installs the skill.** It copies `skill/` (the reverse-engineer-anything
   workflow, adapted from REA under MIT) into the agent's skills folder, so the
   agent knows how to drive REA's tools.

After a restart, ask your agent to investigate a shipped app or binary; the
skill takes over from there. Run the bridge with `--dry-run` to preview, or
`--agent <id>` to target one client. See the README for the full flag list.

The actual reverse engineering is done entirely by REA's MCP server and its
analysis engines (Hopper, Ghidra, IDA, Kuna, static JavaScript/Electron
analysis) — anyrea only wires it to your agent. Credits: adapted from
[morluto/rea](https://github.com/morluto/rea) (MIT). Independent project; not
affiliated with or endorsed by the REA authors or any agent vendor.
