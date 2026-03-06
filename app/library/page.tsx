import Link from "next/link";
import LibraryClient from "@/app/library/LibraryClient";
import { requireActiveSubscriber } from "@/lib/require-active-subscriber";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireActiveSubscriber("/library");

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>My Content Library</h1>
      <p style={{ opacity: 0.85 }}>View and download your completed images.</p>
      <LibraryClient />
      <div style={{ marginTop: 16 }}>
        <Link href="/requests" className="btn btn-primary">
          View Status
        </Link>
      </div>
    </main>
  );
}
