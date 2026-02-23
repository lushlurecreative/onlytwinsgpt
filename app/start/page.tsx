import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export default async function StartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/start");
  }

  const [{ count: myPosts }, { count: myPublished }, { count: mySubscriptions }] = await Promise.all([
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("creator_id", user.id),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("creator_id", user.id)
      .eq("is_published", true),
    supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("subscriber_id", user.id)
      .in("status", ["active", "trialing", "past_due"]),
  ]);

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Start Here</h1>
      <p>This is your control center for what to do next.</p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <article style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Your creator posts</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{myPosts ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Your published posts</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{myPublished ?? 0}</div>
        </article>
        <article style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}>
          <div style={{ opacity: 0.8 }}>Your active subscriptions</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{mySubscriptions ?? 0}</div>
        </article>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 12 }}>Your next steps</h2>
        <ol style={{ marginBottom: 16 }}>
          <li>
            Complete the Training Vault (brief + training photos + request).
          </li>
          <li>
            After approval, we generate and deliver your assets. Come back here or reopen the Training Vault for status.
          </li>
        </ol>
        <Link href="/vault" className="btn btn-primary" style={{ display: "inline-block" }}>
          Open Training Vault
        </Link>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 8 }}>If you are an Admin</h2>
        <p style={{ marginBottom: 12 }}>
          Review leads and run generation.
        </p>
        <Link href="/admin/leads" className="btn btn-secondary" style={{ display: "inline-block" }}>
          Open Admin
        </Link>
      </section>
    </main>
  );
}

