# Setup Guide (Plain Language)

This guide is for the owner, who is **not** a software engineer. Follow it one step
at a time. You will never be asked to paste a password or secret key into a chat.

## The golden rules

1. **Secrets are private.** API keys, passwords, and tokens go ONLY into a service's
   settings page or your local `.env` file — never into a chat, a screenshot, or
   GitHub. Keep a copy of each in a password manager (Bitwarden, 1Password).
2. **GitHub is your backup.** Whenever work is pushed to GitHub, it is safe even if
   your laptop dies. You can continue from any computer.
3. **The cloud does the work.** Your laptop is only ever used to edit code (and even
   that can move to GitHub Codespaces in a browser). All analysis and trading run on
   always-on cloud services.

## Where things live

- **Your code:** `C:\projects\SignalGuard` on this laptop, mirrored to the private
  GitHub repo `fractionalproduct/signalguard-`.
- **Your secrets:** in each cloud service's "Environment Variables" / "Secrets"
  settings box, and in your password manager.
- **Your trading data:** in the managed cloud database (added in Milestone 1).

## If your laptop dies

1. Get any computer and install Git (or just open the repo in **GitHub Codespaces**
   in a browser — nothing to install).
2. Clone the project: `git clone https://github.com/fractionalproduct/signalguard-.git`
3. Re-enter secrets from your password manager into your new `.env` (the cloud
   services already have theirs).
4. Continue exactly where you left off.

## Milestone 0 — what is done and what you do

**Done for you (in this repo):** `AGENTS.md`, `.gitignore`, `.env.example`, the
cloud dev environment (`.devcontainer/`), and the docs you are reading.

**What you need to do now:** see `docs/service-readiness.md`. In short, the first
accounts to create (all free to start) are GitHub (done), an AI provider key, a web
host, a database, Redis, and a worker host. We will do these one at a time when the
milestone that needs them arrives — you do not need them all today.

## How to run commands later (when needed)

If you are ever asked to run a command yourself in this chat, type it with a `!`
in front, e.g. `! git status`, and the result appears here. You will rarely need
to — most steps are done for you.
