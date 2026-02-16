import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

type PageProps = {
  params: Promise<{ creatorId: string }>;
};

type CreatorPostRow = {
  id: string;
  caption: string | null;
  is_published: boolean;
  visibility: "public" | "subscribers";
  created_at: string;
};

export default async function AdminCreatorDetailPage({ params }: PageProps) {
  const { creatorId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/admin/creators/${creatorId}`);
  }

  if (!isAdminUser(user.id)) {
    return <p>❌ Access denied. Add your user ID to ADMIN_USER_IDS.</p>;
  }

  const [{ count: totalPosts }, { count: publicPublished }, { count: subscriberPublished }, postsRes] =
    await Promise.all([
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId)
        .eq("is_published", true)
        .eq("visibility", "public"),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("creator_id", creatorId)
        .eq("is_published", true)
        .eq("visibility", "subscribers"),
      supabase
        .from("posts")
        .select("id, caption, is_published, visibility, created_at")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Creator Detail</h2>
      <p>
        <code>{creatorId}</code>
      </p>
      <p>
        Total: <strong>{totalPosts ?? 0}</strong> | Public published:{" "}
        <strong>{publicPublished ?? 0}</strong> | Subscriber published:{" "}
        <strong>{subscriberPublished ?? 0}</strong>
      </p>

      {postsRes.error ? <p>❌ {postsRes.error.message}</p> : null}
      {!postsRes.error && (postsRes.data ?? []).length === 0 ? <p>No posts.</p> : null}
      {!postsRes.error && (postsRes.data ?? []).length > 0 ? (
        <ul>
          {((postsRes.data ?? []) as CreatorPostRow[]).map((post) => (
            <li key={post.id} style={{ marginBottom: 10 }}>
              <div>{post.caption ?? "(no caption)"}</div>
              <div>
                State: <strong>{post.is_published ? "Published" : "Draft"}</strong> | Visibility:{" "}
                <strong>{post.visibility}</strong>
              </div>
              <div style={{ opacity: 0.8 }}>{new Date(post.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      ) : null}

      <p style={{ marginTop: 12 }}>
        <Link href="/admin/creators">Back to creators</Link>
      </p>
    </section>
  );
}

