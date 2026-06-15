/**
 * @signalguard/source-connectors — Milestone 5 source ingestion adapters.
 *
 * Connectors are the only components that pull raw content from the outside
 * world. They are read-only (never order submission / broker credentials), and
 * every run passes the licensing gate *before* any fetch happens:
 *
 *   runConnector → assertConnectorAllowed → connector.fetch → dedupe (M5b)
 *
 * The MVP ships the MANUAL connector (owner-entered notes) and a MOCK connector
 * for tests/dev. External connectors (X, Telegram, …) stay dormant until their
 * DataSourceConfiguration is APPROVED_FOR_PRODUCTION (AGENTS.md §15).
 */
export {
  type RunEnvironment,
  type LicensingInfo,
  ConnectorNotApprovedError,
  isConnectorAllowed,
  assertConnectorAllowed,
} from "./gate.js";
export {
  type Connector,
  type RunOptions,
  type RunResult,
  runConnector,
} from "./connector.js";
export { ManualConnector, type ManualEntry } from "./manual.js";
export { MockConnector } from "./mock.js";
export {
  TelegramConnector,
  BotApiTelegramClient,
  type TelegramMessage,
  type TelegramBotClient,
  type TelegramConnectorOptions,
  type BotApiOptions,
  type FetchLike,
} from "./telegram.js";
