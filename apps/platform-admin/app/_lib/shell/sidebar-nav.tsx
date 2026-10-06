"use client";

import type { Locale } from "@wlbp/i18n";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "../navigation";

type Group = {
  group: string;
  label: string;
  items: { key: string; href: string; label: string }[];
};

export function SidebarNav({
  locale,
  groups,
  label,
}: {
  locale: Locale;
  groups: Group[];
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label}>
      {groups.map((group) => (
        <div className="nav-group" key={group.group}>
          <h2 id={`nav-${group.group}`}>{group.label}</h2>
          <ul aria-labelledby={`nav-${group.group}`}>
            {group.items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={
                    isActive(pathname, item.href, locale) ? "page" : undefined
                  }
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
