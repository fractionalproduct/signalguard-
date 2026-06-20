"use client";

/**
 * Submit button for the autopilot settings form. When the `armed` checkbox in
 * the same form is checked at submit time, a confirm() gate guards the action —
 * declining preventDefaults the submit so the server action never runs. A server
 * component can't attach onClick, so this thin client component owns the gate.
 */
export function AutopilotArmButton() {
  return (
    <button
      type="submit"
      className="btn-primary"
      onClick={(e) => {
        const form = e.currentTarget.form;
        const armed =
          form?.elements.namedItem("armed") instanceof HTMLInputElement &&
          (form.elements.namedItem("armed") as HTMLInputElement).checked;
        if (
          armed &&
          !confirm(
            "Arm autopilot? It will approve and place paper trades on its own.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      Save autopilot settings
    </button>
  );
}
