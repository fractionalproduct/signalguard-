import type {
  OptionContract,
  OptionPosition,
  PrismaClient,
} from "@prisma/client";

export interface OpenOptionPositionInput {
  occSymbol: string;
  underlying: string;
  /** "CALL" | "PUT". */
  right: string;
  strikeCents: number;
  expiration: Date;
  contracts: number;
  /** Average premium paid PER SHARE, in cents (the filled premium). */
  avgPremiumPaidCents: number;
  multiplier?: number;
}

/**
 * Open a long option position from a filled buy-to-open. Upserts the
 * OptionContract (reference data, keyed by the unique occSymbol) and creates the
 * OptionPosition. `premiumPaidCents` (cost basis = max loss) is derived:
 * contracts × avgPremiumPaidCents × multiplier. Called once the broker confirms
 * the fill — never optimistically.
 */
export async function openOptionPosition(
  db: PrismaClient,
  input: OpenOptionPositionInput,
): Promise<{ positionId: string; contractId: string }> {
  const multiplier = input.multiplier ?? 100;
  const contract = await db.optionContract.upsert({
    where: { occSymbol: input.occSymbol },
    create: {
      occSymbol: input.occSymbol,
      underlying: input.underlying,
      right: input.right,
      strikeCents: input.strikeCents,
      expiration: input.expiration,
      multiplier,
    },
    update: {}, // contract reference data is immutable
    select: { id: true },
  });
  const premiumPaidCents =
    input.contracts * input.avgPremiumPaidCents * multiplier;
  const pos = await db.optionPosition.create({
    data: {
      optionContractId: contract.id,
      contracts: input.contracts,
      avgPremiumPaidCents: input.avgPremiumPaidCents,
      premiumPaidCents,
      status: "OPEN",
    },
    select: { id: true },
  });
  return { positionId: pos.id, contractId: contract.id };
}

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
