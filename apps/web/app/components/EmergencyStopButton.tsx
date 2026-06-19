"use client";

import {
  activateEmergencyStopAction,
  deactivateEmergencyStopAction,
} from "./emergency-stop-actions";

/**
 * Header Emergency Stop control (AGENTS.md §14). A confirm() gate guards both
 * directions — activating blocks new orders + cancels unfilled entries (exits
 * preserved); clearing resumes trading. onClick preventDefault cancels the
 * form's server action when the owner declines.
 */
export function EmergencyStopButton({ active }: { active: boolean }) {
  if (active) {
    return (
      <form action={deactivateEmergencyStopAction}>
        <button
          type="submit"
          className="emergency-stop emergency-stop--active"
          aria-label="Emergency Stop is active — resume trading"
          onClick={(e) => {
            if (
              !confirm(
                "Resume trading? This clears Emergency Stop and allows new orders to be submitted again.",
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          ⛔ STOP ACTIVE — Resume
        </button>
      </form>
    );
  }
  return (
    <form action={activateEmergencyStopAction}>
      <input type="hidden" name="reason" value="Owner-initiated from header" />
      <button
        type="submit"
        className="emergency-stop"
        aria-label="Activate Emergency Stop"
        onClick={(e) => {
          if (
            !confirm(
              "Activate Emergency Stop? This blocks new orders and cancels unfilled entry orders. Protective exits are kept.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        Emergency Stop
      </button>
    </form>
  );
}
