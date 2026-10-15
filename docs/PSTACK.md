# Continue development with pstack

pstack is a set of agent skills, not a web application or a model service. Run it inside Claude Code or Codex in this repository. It uses that client's existing authentication; it needs no separate pstack token.

## This Mac

The 52 skills from `tommyyula/pstack` are installed in both `~/.codex/skills/` and `~/.claude/skills/`, pinned to revision `fce11a3442cfd59a21136de0b7010474c6a10ef5`. The separate iTom Codex environment also has its own installation.

`~/.agents/pstack-models.md` sets every role to `inherit-parent`. Arena, architecture and review panels each have two same-model entries. The current client's model and reasoning settings remain in force. This configuration neither enables Grok nor transfers credentials between clients; parallel reviews still consume model usage.

Codex CLI was upgraded from 0.133.0 to 0.163.0 for compatibility with the current account model. Start Codex from a terminal:

```sh
cd /Users/tyu/clawd/projects/item-Quote-fulfillment
env -u CODEX_HOME codex
```

The explicit environment removal uses the ordinary `~/.codex` login rather than iTom's isolated CODEX_HOME. Do not remove it if you intentionally use another authenticated Codex home.

Claude Code skills are installed, but the current API-key authentication failed a live check (`Invalid API key`). Use Codex now. After fixing Claude authentication, start it with:

```sh
cd /Users/tyu/clawd/projects/item-Quote-fulfillment
claude
```

Codex can invoke an installed skill with `$poteto-mode`; Claude Code uses `/poteto-mode`. Natural language naming the skill also avoids confusion with Slack slash commands. In Slack, ask iTom to use pstack on this repository rather than typing a client slash command.

## First task: establish the baseline

Send this in your chosen agent:

```text
Use pstack's poteto-mode in item-Quote-fulfillment. Read AGENTS.md and the pstack model configuration. First inspect the current quotation workflow and run the existing API/frontend tests and build. Do not change business code yet. Report what works, what fails, and three small next-development tasks with concrete acceptance criteria. Do not merge or deploy.
```

Once the baseline is understood, give one concrete goal and its acceptance criteria. For example: identify the desired quotation behavior, the expected API result, and the expected Excel or UI result. Do not ask merely to “continue development” without naming which outcome matters.

## Local application and checks

Use Node 24.x. From the repository root:

```sh
npm ci
npm --prefix web ci
npm test
npm run typecheck
npm --prefix web test
npm --prefix web run build
```

Run `npm run dev:api` in one terminal and `npm --prefix web run dev` in another. Open http://localhost:5180. The API is on port 5182. With DATABASE_URL unset, it uses `.data/pglite`; do not copy production connection strings into this development flow.

## Another computer

Install the pinned fork's skills for the clients you use:

```sh
npx skills add tommyyula/pstack
```

Select Codex and/or Claude Code. Then run the installed setup-pstack skill and set all role values to `inherit-parent` to avoid the upstream model defaults. Authenticate each client normally. Do not copy another machine's auth files or commit credentials.

## Sources

- https://github.com/tommyyula/pstack
- https://github.com/backnotprop/pstack/blob/main/skills/setup-pstack/SKILL.md
- https://developers.openai.com/plugins/build/skills

## Verified setup baseline (2026-10-15)

Using Node 24: API 19 tests passed; frontend40 tests passed; API typecheck and frontend production build passed. This is a baseline check, not proof that an unspecified future feature is complete.

Codex0.163.0 completed a live read-only inference using the existing ChatGPT login and correctly read the pstack settings and project check commands. Claude Code authentication failed its live check; it is not currently a verified fallback.
