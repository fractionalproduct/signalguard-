import { z } from "zod";

/**
 * Central environment-variable schema for every SignalGuard service.
 *
 * Validation happens once at startup. If a required variable is missing or
 * malformed, the service refuses to boot with a clear error instead of failing
 * unpredictably later. Real secret values live ONLY in host settings or a local
 * .env file (never in Git) — see .env.example.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // 32+ char secret used to sign sessions. Required in production.
  SESSION_SECRET: z.string().min(32).optional(),

  // 32-byte key (base64 or 64-char hex) for encrypting MFA secrets at rest.
  // Validated to exactly 32 bytes by loadEncryptionKey() at use-time.
  ENCRYPTION_KEY: z.string().optional(),

  // Data stores. Optional at this milestone so the scaffold boots without them;
  // services that actually need them assert presence at use-time.
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  // --- Trading safety ---
  // Hard guard: the platform supports paper trading ONLY in the MVP.
  TRADING_MODE: z.enum(["paper"]).default("paper"),
  ALPACA_API_KEY_ID: z.string().optional(),
  ALPACA_API_SECRET_KEY: z.string().optional(),
  ALPACA_BASE_URL: z
    .string()
    .url()
    .default("https://paper-api.alpaca.markets"),

  // AI provider (provider-neutral; start with one).
  AI_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse and cache process.env once. Throws a readable error on misconfig. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n` +
        `Check your .env file or host environment variables (see .env.example).`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Test-only: clear the cached env so a fresh source can be parsed. */
export function __resetEnvCacheForTests(): void {
  cached = null;
}
