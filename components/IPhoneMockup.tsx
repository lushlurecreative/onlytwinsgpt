"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { galleryItems } from "@/lib/gallery-data";

type Props = {
  uploadedPhotos: string[];
};

const sfwItems = galleryItems.filter((i) => !i.nsfw && i.type === "image");

export default function IPhoneMockup({ uploadedPhotos }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const userPhoto = uploadedPhotos[0] ?? "/gallery/cars/photo_2025-09-27_04-36-10 (2).jpg";
  const gridPhotos = sfwItems.slice(0, 6).map((i) => i.src);

  // Each panel fades in/out based on scroll progress
  const opacity0 = useTransform(scrollYProgress, [0, 0.15, 0.38, 0.5], [1, 1, 1, 0]);
  const opacity1 = useTransform(scrollYProgress, [0.38, 0.5, 0.72, 0.85], [0, 1, 1, 0]);
  const opacity2 = useTransform(scrollYProgress, [0.72, 0.85, 1, 1], [0, 1, 1, 1]);

  return (
    <section ref={sectionRef} className="iphone-section">
      <div className="iphone-sticky">
        {/* Left: scroll text beats */}
        <div className="iphone-beats">
          <div className="iphone-beat">
            <p className="eyebrow">Your AI twin</p>
            <h2 className="section-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
              Ready for Instagram
            </h2>
            <p className="section-copy">
              Your custom model generates content that looks like you — styled, lit, and ready to post.
            </p>
          </div>
          <div className="iphone-beat">
            <p className="eyebrow">Drop straight into your feed</p>
            <h2 className="section-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
              A full grid, on demand
            </h2>
            <p className="section-copy">
              20+ scenarios per month. SFW, NSFW, editorial, lifestyle — your directions, your brand.
            </p>
          </div>
          <div className="iphone-beat">
            <p className="eyebrow">Watch it grow</p>
            <h2 className="section-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
              Built for audiences
            </h2>
            <p className="section-copy">
              Consistent, high-quality AI content every month. No camera. No editing. Just results.
            </p>
          </div>
        </div>

        {/* Right: sticky phone */}
        <div className="iphone-phone-wrap">
          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-screen">
              {/* State 0: Instagram profile */}
              <motion.div className="phone-panel" style={{ opacity: opacity0 }}>
                <div className="phone-profile">
                  <div className="phone-profile-photo">
                    <img src={userPhoto} alt="Your profile" />
                  </div>
                  <div className="phone-profile-stats">
                    <div className="phone-stat"><span className="phone-stat-num">248</span><span className="phone-stat-label">posts</span></div>
                    <div className="phone-stat"><span className="phone-stat-num">14.2k</span><span className="phone-stat-label">followers</span></div>
                    <div className="phone-stat"><span className="phone-stat-num">312</span><span className="phone-stat-label">following</span></div>
                  </div>
                </div>
                <div className="phone-handle">@yourtwingpt</div>
                <div className="phone-bio">AI-generated content ✨ Powered by OnlyTwins</div>
                <div className="phone-ig-btn">Follow</div>
              </motion.div>

              {/* State 1: Instagram grid */}
              <motion.div className="phone-panel" style={{ opacity: opacity1 }}>
                <div className="phone-grid">
                  {gridPhotos.map((src, i) => (
                    <div key={i} className="phone-grid-cell">
                      <img src={src} alt={`AI scenario ${i + 1}`} />
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* State 2: Single post with engagement */}
              <motion.div className="phone-panel" style={{ opacity: opacity2 }}>
                <div className="phone-post">
                  <div className="phone-post-img">
                    <img src={gridPhotos[0]} alt="AI post" />
                  </div>
                  <div className="phone-post-meta">
                    <span className="phone-heart">♥</span>
                    <span className="phone-post-likes">2,841 likes</span>
                  </div>
                  <div className="phone-post-caption">
                    <strong>yourtwingpt</strong> New drop from my AI twin ✨ Which one's your fave?
                  </div>
                </div>
              </motion.div>
            </div>
            <div className="phone-home-bar" />
          </div>
        </div>
      </div>
    </section>
  );
}
