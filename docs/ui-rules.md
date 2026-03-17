# UI Rules

## Aesthetic

Premium, modern, uncluttered. This is a paid product used by professional creators. Every screen should feel intentional.

- Tailwind CSS v4 utility classes
- Animations via Framer Motion where appropriate (see `components/PageTransition.tsx`)
- Dark-aware design on all new UI

## Shell separation

**Customer shell:**
- Uses `components/SiteShell.tsx` as the layout wrapper
- Navigation: `components/PrimaryNav.tsx`, `components/AuthNav.tsx`
- Must never contain admin components or admin nav items

**Admin shell:**
- Layout: `app/admin/layout.tsx` with `app/admin/AdminNav.tsx` sidebar
- Nav items: Dashboard, Customers, Leads, Billing / Revenue, Log out
- Must never include customer shell components

**Rule:** Never use `SiteShell` or `PrimaryNav` inside admin pages. Never use `AdminNav` inside customer pages.

## Customer-facing copy rules

Never expose to customers:
- Stripe language: "invoice", "subscription_id", "price_id", "customer portal", "payment method object"
- Internal IDs: generation_request IDs, RunPod job IDs, subject IDs
- Status codes or HTTP errors
- Stack traces or raw error messages
- Technical status names: `past_due`, `trialing`, `incomplete`

Use instead:
- "Your plan" not "your subscription"
- "Payment issue — please update your billing details" not "status: past_due"
- "Your content is being prepared" not "RunPod job pending"
- "Something went wrong. Please try again." for unexpected errors

## Interactive states

Every button, form, and async action must have all three states:
- **Loading** — disable button, show spinner or skeleton
- **Success** — confirm action completed (inline message or state change)
- **Error** — inline error message (never console.log, never alert())

Disable submit buttons while loading to prevent double-submit.

## Components

Shared components in `/components/`:
| Component | Purpose |
|---|---|
| `SiteShell.tsx` | Customer layout wrapper (nav + footer) |
| `PrimaryNav.tsx` | Customer top navigation |
| `AuthNav.tsx` | Auth-aware nav (show/hide login-logout) |
| `AuthAwarePrimaryCta.tsx` | CTA button aware of session state |
| `OnlyTwinsAssistant.tsx` | AI assistant chat widget |
| `PremiumCard.tsx` | Premium plan card |
| `PremiumButton.tsx` | Premium styled button |
| `AnimatedBackground.tsx` | Background animation |
| `PageTransition.tsx` | Page transition wrapper |
| `BeforeAfterSlider.tsx` | Before/after image comparison |
| `BlurredNSFWCard.tsx` | NSFW content blur overlay |
| `GalleryCategoryTabs.tsx` | Gallery category tab filter |

Don't create a new shared component if an existing one can be extended. Keep components co-located with their page if used in only 1-2 places.

## No placeholder content

- No "Coming soon" pages in production
- No Lorem Ipsum or placeholder copy
- No UI elements that don't function
- No buttons that don't do anything

## Accessibility

- All interactive elements must be keyboard accessible
- Images need `alt` text
- Form inputs need labels (visible or `aria-label`)
- Don't use colour alone to communicate state

## NSFW content

- Use `components/BlurredNSFWCard.tsx` for any potentially sensitive content in galleries
- NSFW content is only rendered for subscribers (`lib/entitlements.ts` → `isSubscriber`)
- Never show unblurred NSFW content to unauthenticated users
