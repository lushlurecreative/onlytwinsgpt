"use client";

import { useEffect, useState } from "react";

type CreatorEntry = {
  creatorId: string;
  postCount: number;
};

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorEntry[]>([]);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"posts_desc" | "posts_asc" | "id_asc">("posts_desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const response = await fetch("/api/creators");
      const result = (await response.json().catch(() => ({}))) as {
        creators?: CreatorEntry[];
        error?: string;
      };

      if (!response.ok) {
        setError(result.error ?? "Failed to load creators");
        setLoading(false);
        return;
      }

      setCreators(result.creators ?? []);
      setLoading(false);
    })();
  }, []);

  const filteredCreators = creators
    .filter((creator) => creator.creatorId.toLowerCase().includes(query.toLowerCase().trim()))
    .sort((a, b) => {
      if (sortBy === "posts_asc") return a.postCount - b.postCount;
      if (sortBy === "id_asc") return a.creatorId.localeCompare(b.creatorId);
      return b.postCount - a.postCount;
    });

  return (
    <main style={{ padding: 24 }}>
      <h1>Creators</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creator ID..."
          style={{ padding: "8px 10px", minWidth: 260 }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "posts_desc" | "posts_asc" | "id_asc")}
          style={{ padding: "8px 10px" }}
        >
          <option value="posts_desc">Most posts first</option>
          <option value="posts_asc">Least posts first</option>
          <option value="id_asc">Creator ID A-Z</option>
        </select>
      </div>
      {loading ? <p>Loading...</p> : null}
      {!loading && error ? <p>❌ {error}</p> : null}
      {!loading && !error && creators.length === 0 ? <p>No public creators yet.</p> : null}
      {!loading && !error && creators.length > 0 ? (
        <p style={{ opacity: 0.85 }}>
          Showing <strong>{filteredCreators.length}</strong> of <strong>{creators.length}</strong>{" "}
          creators.
        </p>
      ) : null}
      {!loading && !error && filteredCreators.length > 0 ? (
        <ul style={{ marginTop: 14 }}>
          {filteredCreators.map((creator) => (
            <li key={creator.creatorId} style={{ marginBottom: 10 }}>
              <div>
                <code>{creator.creatorId}</code>
              </div>
              <div>Public posts: {creator.postCount}</div>
              <a href={`/creators/${creator.creatorId}`}>Open profile</a>{" "}
              <span style={{ opacity: 0.7 }}>|</span>{" "}
              <a href={`/feed/creator/${creator.creatorId}`}>Open creator feed</a>
            </li>
          ))}
        </ul>
      ) : null}
      {!loading && !error && creators.length > 0 && filteredCreators.length === 0 ? (
        <p>No creators match that search.</p>
      ) : null}
    </main>
  );
}

