import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/admin";

export default async function AdminCreatorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/creators");
  }

  if (!isAdminUser(user.id)) {
    return <p>❌ Access denied. Add your user ID to ADMIN_USER_IDS.</p>;
  }

  const { data, error } = await supabase
    .from("posts")
    .select("creator_id, is_published, visibility")
    .limit(3000);

  if (error) {
    return <p>❌ {error.message}</p>;
  }

  const byCreator = new Map<
    string,
    { total: number; published: number; publicPublished: number; subscribersPublished: number }
  >();

  for (const row of data ?? []) {
    const creatorId = (row as { creator_id?: string }).creator_id;
    if (!creatorId) continue;
    const entry = byCreator.get(creatorId) ?? {
      total: 0,
      published: 0,
      publicPublished: 0,
      subscribersPublished: 0,
    };
    entry.total += 1;
    if ((row as { is_published?: boolean }).is_published) {
      entry.published += 1;
      if ((row as { visibility?: string }).visibility === "public") entry.publicPublished += 1;
      if ((row as { visibility?: string }).visibility === "subscribers") {
        entry.subscribersPublished += 1;
      }
    }
    byCreator.set(creatorId, entry);
  }

  const rows = [...byCreator.entries()]
    .map(([creatorId, m]) => ({ creatorId, ...m }))
    .sort((a, b) => b.total - a.total);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Creator Management</h2>
      <p>Operational creator list with quick access links.</p>
      {rows.length === 0 ? <p>No creators found.</p> : null}
      {rows.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 860, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Creator</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Total</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Published</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Public</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Subscribers</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #333", padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.creatorId}>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <code>{row.creatorId}</code>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.total}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.published}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.publicPublished}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>{row.subscribersPublished}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid #222" }}>
                    <Link href={`/admin/creators/${row.creatorId}`}>View</Link>{" "}
                    | <Link href={`/feed/creator/${row.creatorId}`}>Feed</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

