"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Inbox" },
  { href: "/admin/generation-requests", label: "Generation Requests" },
  { href: "/admin/leads", label: "Lead Pipeline" },
  { href: "/admin/webhook-health", label: "Webhooks" },
  { href: "/admin/diagnostics", label: "Diagnostics" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`admin-nav-link ${active ? "admin-nav-link-active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

