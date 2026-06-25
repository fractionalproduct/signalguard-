import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  claimPendingAnalysis,
  enqueueTaAnalysis,
  markAnalysisDone,
} from "./ta-analysis-queue.js";

/**
 * These helpers are DB-bound, so we drive them with a minimal in-memory stub of
 * the small Prisma surface they touch (taAnalysisQueue.{findFirst,create,
 * findMany,updateMany} + $transaction). This keeps the test hermetic (no live
 * Postgres) while still exercising the dedupe and atomic-claim logic.
 */
type Row = {
  id: string;
  symbol: string;
  action: string;
  discoveryReason: string | null;
  status: string;
  createdAt: Date;
};

function makeStub(seed: Row[] = []) {
  const rows: Row[] = [...seed];
  let seq = seed.length;
  const model = {
    findFirst: async ({ where }: { where: { symbol: string; status: string } }) => {
      return (
        rows.find((r) => r.symbol === where.symbol && r.status === where.status) ?? null
      );
    },
    create: async ({ data }: { data: Partial<Row> }) => {
      const row: Row = {
        id: `id-${seq++}`,
        symbol: data.symbol as string,
        action: (data.action as string) ?? "BUY",
        discoveryReason: (data.discoveryReason as string | null) ?? null,
        status: (data.status as string) ?? "PENDING",
        createdAt: new Date(2024, 0, 1, 0, 0, seq),
      };
      rows.push(row);
      return { id: row.id };
    },
    findMany: async ({
      where,
      take,
    }: {
      where: { status: string };
      orderBy: unknown;
      take: number;
    }) => {
      return rows
        .filter((r) => r.status === where.status)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, take)
        .map((r) => ({
          id: r.id,
          symbol: r.symbol,
          action: r.action,
          discoveryReason: r.discoveryReason,
        }));
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: { in: string[] } | string; status?: string };
      data: { status: string };
    }) => {
      let count = 0;
      for (const r of rows) {
        const idMatch =
          where.id === undefined
            ? true
            : typeof where.id === "string"
              ? r.id === where.id
              : where.id.in.includes(r.id);
        const statusMatch = where.status === undefined ? true : r.status === where.status;
        if (idMatch && statusMatch) {
          r.status = data.status;
          count += 1;
        }
      }
      return { count };
    },
  };
  const db = {
    taAnalysisQueue: model,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn({ taAnalysisQueue: model }),
  } as unknown as PrismaClient;
  return { db, rows };
}

test("enqueueTaAnalysis inserts a new symbol with defaults", async () => {
  const { db, rows } = makeStub();
  const res = await enqueueTaAnalysis(db, { symbol: "AAPL" });
  assert.equal(res.ok, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.action, "BUY");
  assert.equal(rows[0]?.status, "PENDING");
});

test("enqueueTaAnalysis is idempotent for an already-PENDING symbol", async () => {
  const { db, rows } = makeStub();
  const first = await enqueueTaAnalysis(db, { symbol: "AAPL", discoveryReason: "MOVERS" });
  assert.equal(first.ok, true);
  const second = await enqueueTaAnalysis(db, { symbol: "AAPL" });
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.reason, "already_pending");
  assert.equal(rows.length, 1); // not queued twice
});

test("enqueueTaAnalysis re-queues a symbol that is only DONE (PENDING-scoped dedupe)", async () => {
  const { db, rows } = makeStub([
    {
      id: "id-old",
      symbol: "AAPL",
      action: "BUY",
      discoveryReason: null,
      status: "DONE",
      createdAt: new Date(2024, 0, 1),
    },
  ]);
  const res = await enqueueTaAnalysis(db, { symbol: "AAPL" });
  assert.equal(res.ok, true); // DONE does not block a fresh enqueue
  assert.equal(rows.filter((r) => r.status === "PENDING").length, 1);
});

test("claimPendingAnalysis claims oldest-first, flips to CLAIMED, caps limit", async () => {
  const seed: Row[] = ["A", "B", "C"].map((sym, i) => ({
    id: `id-${sym}`,
    symbol: sym,
    action: "BUY",
    discoveryReason: null,
    status: "PENDING",
    createdAt: new Date(2024, 0, 1, 0, 0, i),
  }));
  const { db, rows } = makeStub(seed);
  const claimed = await claimPendingAnalysis(db, 2);
  assert.equal(claimed.length, 2);
  assert.deepEqual(
    claimed.map((c) => c.symbol),
    ["A", "B"],
  );
  // Claimed rows are now CLAIMED; the untouched one stays PENDING.
  assert.equal(rows.find((r) => r.id === "id-A")?.status, "CLAIMED");
  assert.equal(rows.find((r) => r.id === "id-C")?.status, "PENDING");
});

test("claimPendingAnalysis returns [] when nothing is PENDING", async () => {
  const { db } = makeStub();
  const claimed = await claimPendingAnalysis(db, 10);
  assert.deepEqual(claimed, []);
});

test("markAnalysisDone reports not_found for an unknown id", async () => {
  const { db } = makeStub();
  const res = await markAnalysisDone(db, "nope");
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "not_found");
});

test("markAnalysisDone flips a CLAIMED row to DONE", async () => {
  const { db, rows } = makeStub([
    {
      id: "id-1",
      symbol: "AAPL",
      action: "BUY",
      discoveryReason: null,
      status: "CLAIMED",
      createdAt: new Date(),
    },
  ]);
  const res = await markAnalysisDone(db, "id-1");
  assert.equal(res.ok, true);
  assert.equal(rows[0]?.status, "DONE");
});
