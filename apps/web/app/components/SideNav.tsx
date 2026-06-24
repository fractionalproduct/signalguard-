"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, isGroup, type NavGroup } from "../nav-config";

function pathMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** True when the active path is inside this group (so it starts expanded). */
function groupIsActive(pathname: string, group: NavGroup): boolean {
  if (group.href && pathMatches(pathname, group.href)) return true;
  return group.items.some((item) => pathMatches(pathname, item.href));
}

function Group({ group, pathname }: { group: NavGroup; pathname: string }) {
  const active = groupIsActive(pathname, group);
  const [open, setOpen] = useState(active);

  return (
    <div className={`nav-group${active ? " nav-group-active" : ""}`}>
      <div className="nav-group-header">
        {group.href ? (
          <Link className="nav-group-label" href={group.href}>
            {group.label}
          </Link>
        ) : (
          <button
            type="button"
            className="nav-group-label as-button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {group.label}
          </button>
        )}
        <button
          type="button"
          className="nav-group-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${group.label}`}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>
      {open ? (
        <div className="nav-sublist">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-sublink${
                pathMatches(pathname, item.href) ? " nav-link-active" : ""
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SideNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="side-nav" aria-label="Main navigation">
      {NAV.map((entry) =>
        isGroup(entry) ? (
          <Group key={entry.label} group={entry} pathname={pathname} />
        ) : (
          <Link
            key={entry.href}
            href={entry.href}
            className={`nav-link${
              pathMatches(pathname, entry.href) ? " nav-link-active" : ""
            }`}
          >
            {entry.label}
          </Link>
        ),
      )}
    </nav>
  );
}
