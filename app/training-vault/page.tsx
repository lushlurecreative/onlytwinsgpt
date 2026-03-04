import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getEntitlements } from "@/lib/entitlements";

function Card({ title, desc, href, cta }: { title: string; desc: string; href: string; cta: string }) {
  return (
    <Link href={href} style={{ border: "1px solid #333", borderRadius: 16, padding: 18 }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 8, opacity: 0.8 }}>{desc}</div>
      <div style={{ marginTop: 14 }}>
        <span className="btn btn-primary" style={{ display: "inline-block" }}>
          {cta}
        </span>
      </div>
    </Link>
  );
}

export default async function TrainingVaultPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/training-vault");
  }

  const ent = await getEntitlements(supabase, user.id);
  if (!ent.isSubscriber) {
    redirect("/pricing");
  }

  return (
    <main style={{ padding: 24, maxWidth: 1080, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0, fontSize: 40 }}>Training Vault</h1>
      <p style={{ opacity: 0.8 }}>
        Upload training photos, request your twin content, and manage your subscription.
      </p>

      <section
        style={{
          marginTop: 26,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: 12,
        }}
      >
        <Card
          title="Upload training photos"
          desc="Add your best photos so we can train your twin accurately."
          href="/upload"
          cta="Upload photos"
        />
        <Card
          title="Request new content"
          desc="Submit your content request and we will queue it for delivery."
          href="/start"
          cta="Request content"
        />
        <Card
          title="Account & billing"
          desc="Manage subscription and open your billing portal."
          href="/billing"
          cta="Open billing"
        />
      </section>

      <section style={{ marginTop: 20, border: "1px solid #333", borderRadius: 16, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Next steps</h2>
        <ol style={{ marginBottom: 0 }}>
          <li>Upload your training photos.</li>
          <li>Submit your first content request.</li>
          <li>We deliver assets back in your dashboard.</li>
        </ol>
      </section>
    </main>
  );
}
