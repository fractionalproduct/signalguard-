"use client";

import { useRef, useState, useTransition } from "react";

import { askAssistant } from "../(dashboard)/assistant/actions";
import type { AssistantTurn } from "../../lib/assistant";

/**
 * Owner chat assistant UI — Slice 1 (read-only Q&A). Holds the transcript
 * client-side and calls the askAssistant server action per turn; the action
 * runs the read-only tool loop and returns the reply. No trade controls here:
 * the assistant can only read account data.
 */
export function AssistantChat() {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listEndRef = useRef<HTMLDivElement>(null);

  function send() {
    const text = draft.trim();
    if (!text || pending) return;
    setError(null);
    const next: AssistantTurn[] = [...turns, { role: "user", text }];
    setTurns(next);
    setDraft("");
    startTransition(async () => {
      const result = await askAssistant(next);
      if (result.status === "ok") {
        setTurns((cur) => [...cur, { role: "assistant", text: result.reply }]);
      } else {
        setError(result.message);
      }
      requestAnimationFrame(() =>
        listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section className="page-card">
      <p className="eyebrow">Assistant · read-only</p>
      <h1>Assistant</h1>
      <p className="lead">
        Ask about your paper portfolio, a symbol&apos;s latest analysis, or
        what&apos;s in the proposal queue — and ask it to draft a trade. Drafts
        land in your queue as proposals you approve; the assistant never
        approves or executes anything itself.
      </p>

      <div className="assistant-thread" role="log" aria-live="polite">
        {turns.length === 0 ? (
          <div className="empty-state" role="status">
            Try: &ldquo;How is my portfolio doing?&rdquo;, &ldquo;How does AAPL
            look?&rdquo;, &ldquo;What&apos;s in the proposal queue?&rdquo;, or
            &ldquo;Draft a trade for AAPL.&rdquo;
          </div>
        ) : (
          turns.map((turn, i) => (
            <div
              key={i}
              className={`assistant-msg assistant-msg--${turn.role}`}
            >
              <span className="assistant-msg__who">
                {turn.role === "user" ? "You" : "Assistant"}
              </span>
              <p className="assistant-msg__text">{turn.text}</p>
            </div>
          ))
        )}
        {pending ? (
          <p className="muted assistant-pending">Assistant is thinking…</p>
        ) : null}
        <div ref={listEndRef} />
      </div>

      {error ? (
        <div className="empty-state add-source-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="add-source-row" style={{ marginTop: 16 }}>
        <textarea
          className="add-source-input"
          rows={2}
          placeholder="Ask about your portfolio, a symbol, or the queue…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={pending}
          aria-label="Message the assistant"
        />
        <button
          type="button"
          className="add-source-submit"
          onClick={send}
          disabled={pending || draft.trim().length === 0}
        >
          Send
        </button>
      </div>
    </section>
  );
}
