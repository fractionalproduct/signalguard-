"use client";

import { usePathname } from "next/navigation";
import { findPageMeta } from "../nav-config";

/**
 * The "what this page does" banner shown at the top of every page. Reads the
 * current path and renders the matching description from the shared nav config,
 * so every page explains itself without each page having to repeat the text.
 */
export function PageIntro() {
  const pathname = usePathname() ?? "";
  const meta = findPageMeta(pathname);
  if (!meta) return null;

  return (
    <div className="page-intro" role="note">
      <span className="page-intro-label">{meta.label}</span>
      <p className="page-intro-text">{meta.description}</p>
    </div>
  );
}
