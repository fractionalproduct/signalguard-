/**
 * create-owner — one-time CLI to create the single platform owner account.
 *
 * Public registration is disabled; this is the only way an account is made.
 * Run with:  pnpm create-owner
 *
 * Requires DATABASE_URL (the Supabase pooled connection). The script reads it
 * from the environment, or from packages/database/.env / .env at the repo root.
 * Two-factor (MFA) and recovery codes are enrolled later in the web app.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout, argv, cwd, exit } from "node:process";
import { hashPassword, validatePasswordStrength } from "@signalguard/auth";
import { PrismaClient } from "@prisma/client";

// ---- minimal .env loader (no dependency) ----------------------------------
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

// ---- prompts --------------------------------------------------------------
function ask(query: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(query);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (data: string) => {
      stdin.pause();
      stdin.removeListener("data", onData);
      resolve(data.replace(/[\r\n]+$/u, ""));
    };
    stdin.once("data", onData);
  });
}

function askHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(query);
    let value = "";
    const isTty = Boolean(stdin.isTTY);
    if (isTty) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        // Enter (\n \r) or Ctrl-D (): finish
        if (ch === "\n" || ch === "\r" || ch === "") {
          if (isTty) stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "") {
          // Ctrl-C: abort
          if (isTty) stdin.setRawMode(false);
          stdout.write("\n");
          exit(1);
        }
        if (ch === "" || ch === "\b") {
          value = value.slice(0, -1);
        } else if (ch >= " ") {
          value += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

async function main(): Promise<void> {
  loadEnvFile(join(cwd(), "packages", "database", ".env"));
  loadEnvFile(join(cwd(), ".env"));

  if (!process.env.DATABASE_URL) {
    console.error(
      "\nDATABASE_URL is not set. Create packages/database/.env with your Supabase\n" +
        'connection string (DATABASE_URL="postgresql://...") and run this again.\n',
    );
    exit(1);
  }

  const force = argv.includes("--force");
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.owner.count();
    if (existing > 0 && !force) {
      console.error(
        "\nAn owner account already exists. This is a single-owner system.\n" +
          "Re-run with --force only if you intend to add another (not recommended).\n",
      );
      exit(1);
    }

    console.log("\nCreate the SignalGuard owner account.\n");
    const email = (await ask("Owner email: ")).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      console.error("That does not look like a valid email address.");
      exit(1);
    }

    const password = await askHidden("Password (min 12 chars): ");
    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
      console.error(strength.reason ?? "Password does not meet requirements.");
      exit(1);
    }
    const confirm = await askHidden("Confirm password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      exit(1);
    }

    const passwordHash = await hashPassword(password);
    const owner = await prisma.owner.create({
      data: { email, passwordHash, passwordChangedAt: new Date() },
      select: { id: true, email: true },
    });

    console.log(`\n✓ Owner created: ${owner.email}`);
    console.log("  Next: sign in on the web app and enrol two-factor authentication.\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unique constraint")) {
      console.error("\nAn account with that email already exists.\n");
    } else {
      console.error(`\nFailed to create owner: ${message}\n`);
    }
    exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
