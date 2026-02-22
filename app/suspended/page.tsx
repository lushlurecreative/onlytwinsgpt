import Link from "next/link";

export default function SuspendedPage() {
  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ marginTop: 0 }}>Account suspended</h1>
      <p className="muted">
        Your account has been suspended. If you believe this is an error, please contact support.
      </p>
      <p style={{ marginTop: 24 }}>
        <Link href="/" className="btn btn-ghost">
          Return home
        </Link>
      </p>
    </main>
  );
}
