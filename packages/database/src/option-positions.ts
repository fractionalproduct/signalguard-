import type {
  OptionContract,
  OptionPosition,
  PrismaClient,
} from "@prisma/client";

/** A long option position paired with its contract (the display unit). */
export interface OptionPositionWithContract {
  position: OptionPosition;
  contract: OptionContract;
}

/**
 * Open (OPEN / CLOSING) long option positions with their contract, newest
 * first. Read-only for M17 Slice 1 — there is no writer yet, so this returns []
 * until manual options trading lands (Slice 3).
 */
export async function listOpenOptionPositions(
  db: PrismaClient,
  limit = 100,
): Promise<OptionPositionWithContract[]> {
  const rows = await db.optionPosition.findMany({
    where: { status: { in: ["OPEN", "CLOSING"] } },
    orderBy: { openedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
    include: { optionContract: true },
  });
  return rows.map(({ optionContract, ...position }) => ({
    position,
    contract: optionContract,
  }));
}
