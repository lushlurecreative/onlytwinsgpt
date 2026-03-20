"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/generation-queue", label: "Generation Queue" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/revenue", label: "Billing / Revenue" },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="admin-nav" aria-label="Admin">
      {NAV.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--line, #333)" }}>
        <a href="/logout" className="admin-nav-link" style={{ display: "block" }}>
          Log out
        </a>
      </div>
    </nav>
  );
}

