#!/usr/bin/env bash
# Installs Claude Code CLI inside the Codespace and wires the prod-guard
# PreToolUse hook into ~/.claude/settings.json. Idempotent: re-running
# is safe (will not duplicate hook entries or overwrite unrelated config).
#
# Invoked from .devcontainer/devcontainer.json `postCreateCommand`.
# Skipped automatically outside a Codespace (no CODESPACES env var).
set -euo pipefail

if [ "${CODESPACES:-}" != "true" ]; then
  echo "[prod-guard] not a Codespace — skipping Claude CLI + hook install."
  exit 0
fi

cd "$(git rev-parse --show-toplevel)"

echo "[prod-guard] installing Claude Code CLI (global npm)..."
command -v claude >/dev/null 2>&1 || npm i -g @anthropic-ai/claude-code

echo "[prod-guard] copying hook to ~/.claude/hooks/prod-guard.mjs..."
mkdir -p ~/.claude/hooks
cp .devcontainer/hooks/prod-guard.mjs ~/.claude/hooks/prod-guard.mjs
chmod +x ~/.claude/hooks/prod-guard.mjs

echo "[prod-guard] wiring hook into ~/.claude/settings.json..."
node --input-type=module -e '
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const file = join(homedir(), ".claude", "settings.json");
const cfg = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
cfg.hooks ??= {};
cfg.hooks.PreToolUse ??= [];
const cmd = `node ${join(homedir(), ".claude", "hooks", "prod-guard.mjs")}`;
let bash = cfg.hooks.PreToolUse.find(e => e.matcher === "Bash");
if (!bash) { bash = { matcher: "Bash", hooks: [] }; cfg.hooks.PreToolUse.push(bash); }
bash.hooks ??= [];
if (!bash.hooks.some(h => h.command === cmd)) {
  bash.hooks.unshift({ type: "command", command: cmd });
}
writeFileSync(file, JSON.stringify(cfg, null, 2));
console.log("[prod-guard] installed →", file);
'

echo "[prod-guard] DONE. Launch with:"
echo "  claude --dangerously-skip-permissions"
echo ""
echo "[prod-guard] Blocked even under bypass:"
echo "  git push to main/master/prod, git --force, --no-verify,"
echo "  gh pr merge, vercel --prod, vercel promote/alias set, railway deploy,"
echo "  npm/yarn/pnpm publish, supabase db push, prisma migrate deploy,"
echo "  gh release create, rm -rf ~/."
