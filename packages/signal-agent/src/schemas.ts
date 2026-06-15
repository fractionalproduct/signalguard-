import type { Schema } from "@signalguard/agent-core";
import { validateSignalDraft, type SignalDraft } from "@signalguard/signals";
import { SOURCE_KINDS, type SourceKind } from "@signalguard/domain";

/**
 * Input to the Signal Analysis agent: one piece of source content plus light
 * provenance. `content` is hostile data — it is analyzed, never obeyed.
 */
export interface SignalAnalysisInput {
  content: string;
  sourceKind?: SourceKind;
  sourceName?: string;
}


/** Validate untrusted input into a SignalAnalysisInput (deny-by-default). */
export const validateSignalAnalysisInput: Schema<SignalAnalysisInput> = (input) => {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["expected an object"] };
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.content !== "string" || obj.content.trim() === "") {
    errors.push("content must be a non-empty string");
  }
  if (
    obj.sourceKind !== undefined &&
    !SOURCE_KINDS.includes(obj.sourceKind as SourceKind)
  ) {
    errors.push("sourceKind must be a valid SourceKind");
  }
  if (obj.sourceName !== undefined && typeof obj.sourceName !== "string") {
    errors.push("sourceName must be a string");
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: SignalAnalysisInput = { content: obj.content as string };
  if (obj.sourceKind !== undefined) value.sourceKind = obj.sourceKind as SourceKind;
  if (obj.sourceName !== undefined) value.sourceName = obj.sourceName as string;
  return { ok: true, value };
};

/**
 * Output schema for the agent: the model's structured output is re-validated and
 * sanitized by M5b's validateSignalDraft. The model's shape is never trusted —
 * this is the second validation pass (after the executor's own parse), so any
 * instruction-injection that survives into the output is still stripped here.
 */
export const signalDraftOutputSchema: Schema<SignalDraft> = (input) =>
  validateSignalDraft(input);

export type { SignalDraft } from "@signalguard/signals";
