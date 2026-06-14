/** Delivery channels supported by the MVP notification contract. */
export type NotificationChannel = "in_app" | "email";

/** Operator-facing urgency for routing and display decisions. */
export type NotificationSeverity = "info" | "warning" | "critical";

interface NotificationEventBase {
  /** Unique event identifier supplied by the caller for audit/dedupe use. */
  id: string;
  /** ISO-8601 UTC timestamp for when the event occurred. */
  occurredAt: string;
  /** Human-readable notification title. Must not contain secrets. */
  title: string;
  /** Human-readable notification body. Must not contain secrets. */
  message: string;
  severity: NotificationSeverity;
}

export interface SymbolEventFields {
  symbol: string;
}

export interface OrderEventFields extends SymbolEventFields {
  orderId: string;
  proposalId?: string;
  quantity?: number;
}

export interface PositionEventFields extends SymbolEventFields {
  positionId: string;
  orderId?: string;
}

export interface PnlEventFields {
  periodStart: string;
  periodEnd: string;
  realizedPnl: number;
  unrealizedPnl: number;
  currency: "USD";
}

export type NotificationEvent =
  | (NotificationEventBase & { type: "morning_briefing"; briefingId: string })
  | (NotificationEventBase & {
      type: "proposal_awaiting_approval";
      proposalId: string;
      symbol: string;
    })
  | (NotificationEventBase & { type: "order_submitted" } & OrderEventFields)
  | (NotificationEventBase & { type: "order_partial_fill"; filledQuantity: number } & OrderEventFields)
  | (NotificationEventBase & { type: "order_filled"; filledQuantity: number } & OrderEventFields)
  | (NotificationEventBase & { type: "order_rejected"; reason: string } & OrderEventFields)
  | (NotificationEventBase & { type: "stop_triggered"; stopPrice: number } & PositionEventFields)
  | (NotificationEventBase & { type: "target_reached"; targetPrice: number } & PositionEventFields)
  | (NotificationEventBase & { type: "position_closed"; realizedPnl: number } & PositionEventFields)
  | (NotificationEventBase & { type: "loss_warning"; currentLoss: number; limit: number })
  | (NotificationEventBase & { type: "loss_limit_reached"; currentLoss: number; limit: number })
  | (NotificationEventBase & { type: "broker_disconnection"; broker: string })
  | (NotificationEventBase & { type: "stale_data"; dataSource: string; staleSince: string })
  | (NotificationEventBase & { type: "agent_failure"; agentName: string; failureId: string })
  | (NotificationEventBase & { type: "security_incident"; incidentId: string })
  | (NotificationEventBase & { type: "emergency_stop"; activatedBy: "owner" | "system" })
  | (NotificationEventBase & { type: "daily_pnl" } & PnlEventFields)
  | (NotificationEventBase & { type: "monthly_pnl" } & PnlEventFields);

export interface NotificationSendInput {
  event: NotificationEvent;
  channels: readonly NotificationChannel[];
}

export interface NotificationSendResult {
  ok: boolean;
  transportId: string;
  acceptedChannels: readonly NotificationChannel[];
  error?: string;
}

/**
 * Provider-neutral notification boundary.
 *
 * Implementations must not assume a specific email, SMS, push, or in-app vendor.
 * This package intentionally defines only contracts and a test-only in-memory mock.
 */
export interface NotificationTransport {
  send(input: NotificationSendInput): Promise<NotificationSendResult>;
}

export interface SentNotificationRecord extends NotificationSendInput {
  transportId: string;
}

/** In-memory test double. Do not use for production delivery. */
export class InMemoryNotificationTransport implements NotificationTransport {
  readonly sent: SentNotificationRecord[] = [];

  async send(input: NotificationSendInput): Promise<NotificationSendResult> {
    const transportId = `in-memory-${this.sent.length + 1}`;
    this.sent.push({
      event: input.event,
      channels: [...input.channels],
      transportId,
    });

    return {
      ok: true,
      transportId,
      acceptedChannels: [...input.channels],
    };
  }

  clear(): void {
    this.sent.length = 0;
  }
}
