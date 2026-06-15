/**
 * Human-review queue. Low-confidence or otherwise escalated agent outputs land
 * here instead of being treated as final (docs/agent-workflows.md: "Escalate
 * low-confidence or blocked decisions to human review"). In-memory for now; a
 * later milestone backs it with a durable queue.
 */
export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ReviewItem {
  id: string;
  runId: string;
  agentId: string;
  agentVersion: string;
  reason: string;
  /** The structured output awaiting a human decision. */
  output: unknown;
  confidence: number;
  status: ReviewStatus;
}

export class HumanReviewQueue {
  private readonly items = new Map<string, ReviewItem>();
  private seq = 0;

  enqueue(item: Omit<ReviewItem, "id" | "status">): ReviewItem {
    const id = `review-${++this.seq}`;
    const stored: ReviewItem = { ...item, id, status: "pending" };
    this.items.set(id, stored);
    return stored;
  }

  pending(): ReviewItem[] {
    return [...this.items.values()].filter((i) => i.status === "pending");
  }

  get(id: string): ReviewItem {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown review item "${id}".`);
    return item;
  }

  decide(id: string, decision: "approved" | "rejected"): ReviewItem {
    const item = this.get(id);
    if (item.status !== "pending") {
      throw new Error(`Review item "${id}" already ${item.status}.`);
    }
    item.status = decision;
    return item;
  }
}
