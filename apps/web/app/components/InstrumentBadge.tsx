/**
 * The instrument-type differentiator (M17 Slice 1b). Every position row across
 * the home page carries one of these so an equity trade can NEVER be mistaken
 * for an options trade. Rendered as a tinted, bold pill (NOT plain coloured
 * text) so it reads as a distinct kind of element from the green/red P&L text
 * already in the tables.
 *
 * Pure presentational server component — no client state, no I/O.
 */

type InstrumentBadgeProps =
  | { kind: "EQUITY" }
  | { kind: "OPTION"; right: "CALL" | "PUT" };

export function InstrumentBadge(props: InstrumentBadgeProps) {
  if (props.kind === "EQUITY") {
    return (
      <span className="instrument-badge instrument-badge--equity">EQUITY</span>
    );
  }
  const variant =
    props.right === "PUT"
      ? "instrument-badge--option-put"
      : "instrument-badge--option-call";
  return (
    <span className={`instrument-badge ${variant}`}>OPTION · {props.right}</span>
  );
}
