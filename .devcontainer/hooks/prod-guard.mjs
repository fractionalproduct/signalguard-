#!/usr/bin/env node
// PreToolUse hook for Claude Code. Installed at ~/.claude/hooks/prod-guard.mjs
// inside Codespaces by .devcontainer/install-claude-prod-guard.sh
// (invoked from devcontainer.json postCreateCommand).
//
// Purpose: make `claude --dangerously-skip-permissions` safe inside an
// ephemeral Codespace by hard-blocking the small set of commands whose
// blast radius escapes the sandbox (production deploys, force pushes,
// publishes, PR merges). Everything else auto-approves with no prompt.
//
// Hooks fire even in bypass mode. Exit 2 + stderr = block the tool call.
// Project-scoped .claude/settings.json (explicit allow-list) remains the
// gate when running `claude` WITHOUT --dangerously-skip-permissions.

import { readFileSync } from 'node:fs';

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

if (payload.tool_name !== 'Bash') process.exit(0);

const cmd = String(payload.tool_input?.command ?? '');

const DENY = [
  { re: /\bgit\s+push\b[^|;&]*\b(main|master|production|prod)\s*(:[^\s]+)?\s*(#.*)?$/m, why: 'git push to main/master/prod branch' },
  { re: /\bgit\s+push\b[^|;&]*\s(-f|--force|--force-with-lease)\b/m, why: 'git force push' },
  { re: /\bgit\s+(push|commit)\b[^|;&]*--no-verify\b/m, why: 'git --no-verify (skips required hooks)' },
  { re: /\bgh\s+pr\s+merge\b/m, why: 'gh pr merge (owner-only per AGENTS.md)' },
  { re: /\bvercel\b[^|;&]*\s--prod\b/m, why: 'vercel --prod' },
  { re: /\bvercel\s+(promote|alias\s+set)\b/m, why: 'vercel promote / alias set' },
  { re: /\brailway\s+(up|deploy|run)\b/m, why: 'railway deploy' },
  { re: /\b(npm|yarn|pnpm)\s+publish\b/m, why: 'package publish' },
  { re: /\bsupabase\s+db\s+push\b/m, why: 'supabase db push (production migration)' },
  { re: /\bprisma\s+migrate\s+deploy\b/m, why: 'prisma migrate deploy (production migration)' },
  { re: /\bgh\s+release\s+create\b/m, why: 'gh release create' },
  { re: /\brm\s+-rf\s+(\/|~|\$HOME)\b/m, why: 'rm -rf on home or root' },
];

for (const { re, why } of DENY) {
  if (re.test(cmd)) {
    console.error(`[prod-guard] BLOCKED: ${why}.`);
    console.error(`[prod-guard] Command: ${cmd}`);
    console.error(`[prod-guard] To run this, paste it into a terminal yourself.`);
    process.exit(2);
  }
}

process.exit(0);
