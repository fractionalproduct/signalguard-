import { toggleMockModeAction } from "../../lib/mock/mock-toggle-action";

/**
 * Dev-only floating control to switch between mock sample data and live paper
 * data without editing env / restarting. Rendered by the root layout ONLY when
 * not in production. `active` is the current mock state.
 */
export function MockToggle({ active }: { active: boolean }) {
  return (
    <form action={toggleMockModeAction} className="mock-toggle">
      <button
        type="submit"
        className={`mock-toggle__btn${active ? " is-on" : ""}`}
        aria-label={
          active
            ? "Mock data is on — switch to live paper data"
            : "Switch to mock sample data"
        }
      >
        {active ? "🧪 Mock data ON — switch to live" : "🧪 Switch to mock data"}
      </button>
    </form>
  );
}
