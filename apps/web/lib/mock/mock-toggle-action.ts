"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MOCK_COOKIE } from "./mock-cookie";
import { isMockMode } from "./mock-mode";

/**
 * Flip the per-browser mock-data toggle (dev-only control). Sets the `sg_mock`
 * cookie and bounces to a sensible landing page: /home when turning mock ON
 * (no login needed in mock mode), /login when turning it OFF (auth is back).
 *
 * No-op safety: in production isMockMode() is always false and the toggle is
 * never rendered, so this can't be used to weaken a deployed build.
 */
export async function toggleMockModeAction(): Promise<void> {
  const turningOn = !isMockMode();
  cookies().set(MOCK_COOKIE, turningOn ? "1" : "0", {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(turningOn ? "/home" : "/login");
}
