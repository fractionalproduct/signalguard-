/**
 * reset-password — reset the owner's password from the command line.
 *
 * For a single-owner system this is the simplest, safest "forgot password" path:
 * no email service required. Run with:  pnpm reset-password
 *
 * It also revokes all existing sessions, so a password reset signs out every
 * device. Requires DATABASE_URL (read from env or packages/database/.env).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout, cwd, exit } from "node:process";
import { hashPassword, validatePasswordStrength } from "@signalguard/auth";
import { PrismaClient } from "@prisma/client";

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
    if (key) process.env[key] = value;
  }
}

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
        if (ch === "\n" || ch === "\r" || ch === "") {
          if (isTty) stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "") {
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
    console.error("\nDATABASE_URL is not set (see packages/database/.env).\n");
    exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const email = (await ask("Owner email: ")).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      console.error("That does not look like a valid email address.");
      exit(1);
    }
    const owner = await prisma.owner.findUnique({ where: { email } });
    if (!owner) {
      console.error("No owner with that email exists.");
      exit(1);
    }

    const password = await askHidden("New password (min 12 chars): ");
    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
      console.error(strength.reason ?? "Password does not meet requirements.");
      exit(1);
    }
    const confirm = await askHidden("Confirm new password: ");
    if (password !== confirm) {
      console.error("Passwords do not match.");
      exit(1);
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.owner.update({
        where: { id: owner.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      // Sign out everywhere: revoke all active sessions.
      prisma.session.updateMany({
        where: { ownerId: owner.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    console.log(`\n✓ Password reset for ${owner.email}. All sessions were signed out.\n`);
  } catch (err) {
    console.error(`\nFailed to reset password: ${err instanceof Error ? err.message : String(err)}\n`);
    exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
