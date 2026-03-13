"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useState } from "react";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/revenue", label: "Billing / Revenue" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setLoggingOut(false);
    }
    window.location.href = "/";
  }

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
        <button
          type="button"
          className="admin-nav-link"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          style={{ background: "none", border: "none", cursor: loggingOut ? "wait" : "pointer", width: "100%", textAlign: "left", font: "inherit", padding: 0 }}
        >
          {loggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </nav>
  );
}

