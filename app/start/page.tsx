import Link from "next/link";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";

export const dynamic = "force-dynamic";

export default async function StartPage() {
  await requireActiveSubscriber("/start");

  const cards = [
    {
      title: "Upload Training Photos",
      description: "Upload the photos we'll use to train your twin.",
      buttonText: "Upload Photos",
      href: "/training/photos",
    },
    {
      title: "Choose Your Package / Generation Preferences",
      description: "Confirm what type of content and package you want generated.",
      buttonText: "Set Preferences",
      href: "/requests",
    },
    {
      title: "View My Requests",
      description: "Track your training and generation progress.",
      buttonText: "View Status",
      href: "/requests",
    },
    {
      title: "My Content Library",
      description: "View and download your completed images.",
      buttonText: "Open Library",
      href: "/library",
    },
    {
      title: "Account & Billing",
      description: "Manage your plan, email, and billing details.",
      buttonText: "Open Account",
      href: "/billing",
    },
  ];

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Welcome to OnlyTwins</h1>
      <p style={{ opacity: 0.86, maxWidth: 760 }}>
        Your subscription is active. Start by uploading your training photos so we can generate your twin images.
      </p>

      <section
        style={{
          marginTop: 20,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
        }}
      >
        {cards.map((card) => (
          <article key={card.title} style={{ border: "1px solid #333", borderRadius: 12, padding: 16 }}>
            <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 20 }}>{card.title}</h2>
            <p style={{ opacity: 0.8, minHeight: 44 }}>{card.description}</p>
            <Link href={card.href} className="btn btn-primary" style={{ display: "inline-block", marginTop: 6 }}>
              {card.buttonText}
            </Link>
          </article>
        ))}
      </section>

      <section style={{ marginTop: 20 }}>
        <Link href="/training/photos" className="btn btn-primary" style={{ display: "inline-block" }}>
          Start Creating My Twin
        </Link>
      </section>
    </main>
  );
}

