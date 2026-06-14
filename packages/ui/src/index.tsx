import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";

const colors = {
  bg: "#0b1020",
  panel: "#11182b",
  panelSoft: "#172033",
  border: "#263249",
  fg: "#e6e9f2",
  muted: "#9aa3b2",
  accent: "#f5a623",
  ok: "#38d39f",
  warn: "#f5a623",
  error: "#ff6b6b",
  unknown: "#9aa3b2"
} as const;

const focusRing = "0 0 0 3px rgba(245, 166, 35, 0.32)";

type Tone = "neutral" | "accent" | "ok" | "warn" | "error" | "unknown";

type BaseProps = {
  className?: string;
  style?: CSSProperties;
};

function mergeStyle(base: CSSProperties, override?: CSSProperties): CSSProperties {
  return { ...base, ...override };
}

function toneColors(tone: Tone): { background: string; border: string; color: string } {
  switch (tone) {
    case "accent":
      return { background: "rgba(245, 166, 35, 0.14)", border: "rgba(245, 166, 35, 0.42)", color: colors.accent };
    case "ok":
      return { background: "rgba(56, 211, 159, 0.14)", border: "rgba(56, 211, 159, 0.42)", color: colors.ok };
    case "warn":
      return { background: "rgba(245, 166, 35, 0.14)", border: "rgba(245, 166, 35, 0.42)", color: colors.warn };
    case "error":
      return { background: "rgba(255, 107, 107, 0.14)", border: "rgba(255, 107, 107, 0.42)", color: colors.error };
    case "unknown":
      return { background: "rgba(154, 163, 178, 0.12)", border: "rgba(154, 163, 178, 0.34)", color: colors.unknown };
    case "neutral":
    default:
      return { background: "rgba(230, 233, 242, 0.07)", border: colors.border, color: colors.fg };
  }
}

export type PageHeaderProps = BaseProps & {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, eyebrow, description, actions, className, style }: PageHeaderProps) {
  return (
    <header
      className={className}
      style={mergeStyle(
        {
          alignItems: "flex-start",
          borderBottom: `1px solid ${colors.border}`,
          display: "flex",
          gap: "16px",
          justifyContent: "space-between",
          padding: "0 0 24px"
        },
        style
      )}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow ? <p style={{ color: colors.accent, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 8px", textTransform: "uppercase" }}>{eyebrow}</p> : null}
        <h1 style={{ color: colors.fg, fontSize: "clamp(28px, 4vw, 42px)", lineHeight: 1.08, margin: 0 }}>{title}</h1>
        {description ? <p style={{ color: colors.muted, fontSize: 16, lineHeight: 1.6, margin: "12px 0 0", maxWidth: 720 }}>{description}</p> : null}
      </div>
      {actions ? <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div> : null}
    </header>
  );
}

export type CardProps = BaseProps & HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  as?: "article" | "section" | "div";
};

export function Card({ as: Element = "section", children, className, style, ...props }: CardProps) {
  return <Element className={className} style={mergeStyle({ background: colors.panel, border: `1px solid ${colors.border}`, borderRadius: 18, boxShadow: "0 18px 42px rgba(0, 0, 0, 0.22)", color: colors.fg, padding: 20 }, style)} {...props}>{children}</Element>;
}

export type BadgeProps = BaseProps & { children: ReactNode; tone?: Tone };

export function Badge({ children, tone = "neutral", className, style }: BadgeProps) {
  const selected = toneColors(tone);
  return <span className={className} style={mergeStyle({ ...selected, alignItems: "center", border: `1px solid ${selected.border}`, borderRadius: 999, display: "inline-flex", fontSize: 12, fontWeight: 700, gap: 6, letterSpacing: "0.04em", lineHeight: 1, padding: "7px 10px", textTransform: "uppercase", whiteSpace: "nowrap" }, style)}>{children}</span>;
}

export type StatusPillProps = BaseProps & { status: "ok" | "warn" | "error" | "unknown"; label?: ReactNode };

export function StatusPill({ status, label, className, style }: StatusPillProps) {
  const selected = toneColors(status);
  return <Badge className={className} style={mergeStyle({ color: selected.color }, style)} tone={status}><span aria-hidden="true" style={{ background: selected.color, borderRadius: 999, display: "inline-block", height: 8, width: 8 }} />{label ?? status}</Badge>;
}

export type StatTileProps = BaseProps & { label: ReactNode; value: ReactNode; delta?: ReactNode; deltaTone?: Tone };

export function StatTile({ label, value, delta, deltaTone = "neutral", className, style }: StatTileProps) {
  return <Card as="div" className={className} style={mergeStyle({ padding: 16 }, style)}><p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>{label}</p><p style={{ color: colors.fg, fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: "8px 0 0" }}>{value}</p>{delta ? <p style={{ color: toneColors(deltaTone).color, fontSize: 13, fontWeight: 700, margin: "8px 0 0" }}>{delta}</p> : null}</Card>;
}

export type EmptyStateProps = BaseProps & { title: ReactNode; description?: ReactNode; action?: ReactNode };

export function EmptyState({ title, description, action, className, style }: EmptyStateProps) {
  return <div className={className} role="status" style={mergeStyle({ background: colors.panelSoft, border: `1px dashed ${colors.border}`, borderRadius: 18, color: colors.fg, padding: 28, textAlign: "center" }, style)}><h2 style={{ fontSize: 22, margin: 0 }}>{title}</h2>{description ? <p style={{ color: colors.muted, lineHeight: 1.6, margin: "10px auto 0", maxWidth: 560 }}>{description}</p> : null}{action ? <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>{action}</div> : null}</div>;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" };

export function Button({ variant = "secondary", style, type = "button", onFocus, onBlur, disabled, ...props }: ButtonProps) {
  const variants = {
    primary: { background: colors.accent, border: colors.accent, color: "#1a1300" },
    secondary: { background: "rgba(230, 233, 242, 0.07)", border: colors.border, color: colors.fg },
    danger: { background: "rgba(255, 107, 107, 0.16)", border: "rgba(255, 107, 107, 0.46)", color: colors.error }
  } as const;

  return (
    <button
      disabled={disabled}
      type={type}
      style={mergeStyle(
        {
          ...variants[variant],
          borderRadius: 12,
          borderStyle: "solid",
          borderWidth: 1,
          boxShadow: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          font: "inherit",
          fontWeight: 800,
          minHeight: 40,
          opacity: disabled ? 0.58 : 1,
          padding: "10px 14px"
        },
        style
      )}
      onFocus={(event) => {
        event.currentTarget.style.boxShadow = focusRing;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        event.currentTarget.style.boxShadow = "none";
        onBlur?.(event);
      }}
      {...props}
    />
  );
}

export type ToolbarProps = BaseProps & { children: ReactNode; "aria-label"?: string };

export function Toolbar({ children, className, style, "aria-label": ariaLabel = "Toolbar" }: ToolbarProps) {
  return <div aria-label={ariaLabel} className={className} role="toolbar" style={mergeStyle({ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, style)}>{children}</div>;
}
