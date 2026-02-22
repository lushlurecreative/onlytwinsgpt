# OnlyTwins mind map — layout and business process

This document is the **single source of truth** for admin layout, routes, and business flow. Future UI or flow changes should align to it.

---

## Target admin route tree

Only these admin routes exist:

- `/admin/leads`
- `/admin/customers`
- `/admin/customers/[workspaceId]`
- `/admin/revenue`

No other admin routes (e.g. standalone Samples, Production, or Vault pages).

---

## Admin tabs

Exactly **three** tabs:

| Tab        | Route / context | What it shows |
|-----------|------------------|----------------|
| **Leads** | `/admin/leads`   | Leads table, summary, and overrides (pre-payment pipeline). |
| **Customers** | `/admin/customers` (list), `/admin/customers/[workspaceId]` (detail) | List of customers; detail view: Subscription, Dataset + Training, Generations, Assets, Failures. |
| **Revenue** | `/admin/revenue` | Revenue metrics and subscription list (from Stripe webhooks). |

---

## Core business flow

**Lead (pre-payment):**  
qualify → sample → outreach → converted.

**Customer (post-payment):**  
dataset → training → generation → vault.

**Revenue:**  
Driven by Stripe webhooks (subscriptions and payments).

---

## Global rules

- **Health indicator (R/Y/G)** on all admin pages.
- **Automation toggles** available where relevant.
- **No standalone Samples, Production, or Vault pages** — those concepts live inside the Customers tab (e.g. detail view: Generations, Assets).
