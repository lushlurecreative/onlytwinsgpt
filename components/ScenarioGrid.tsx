"use client";

import { galleryItems } from "@/lib/gallery-data";

type Props = {
  uploadedPhotos: string[];
};

const gridItems = galleryItems.filter((i) => i.type === "image").slice(0, 24);

export default function ScenarioGrid({ uploadedPhotos }: Props) {
  const userPhoto = uploadedPhotos[0] ?? null;

  return (
    <section className="section scenario-grid-section">
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <p className="eyebrow">Every scenario</p>
        <h2 className="section-title">Your twin in 20+ AI worlds</h2>
        <p className="section-copy" style={{ maxWidth: 560, margin: "0 auto" }}>
          Your face, your brand — dropped into every content direction we offer. SFW, NSFW, editorial, lifestyle, and more.
        </p>
      </div>

      <div className="scenario-grid">
        {gridItems.map((item, i) => (
          <div key={i} className={`scenario-card ${item.nsfw ? "scenario-card-nsfw" : ""}`}>
            <div className="scenario-card-img">
              <img src={item.src} alt={item.title} />
              {item.nsfw && <div className="scenario-card-blur" />}
            </div>
            <div className="scenario-card-foot">
              <div className="scenario-card-user">
                {userPhoto ? (
                  <img src={userPhoto} alt="You" className="scenario-user-thumb" />
                ) : (
                  <div className="scenario-user-placeholder">You</div>
                )}
                <span className="scenario-arrow">→</span>
              </div>
              <span className="scenario-label">{item.title}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
