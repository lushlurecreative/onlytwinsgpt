"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { galleryItems } from "@/lib/gallery-data";

type Props = { uploadedPhotos: string[] };

const sfwItems = galleryItems.filter((i) => !i.nsfw && i.type === "image");

export default function IPhoneMockup({ uploadedPhotos }: Props) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  const userPhoto = uploadedPhotos[0];
  const gridPhotos = sfwItems.slice(0, 9).map((i) => i.src);

  // Three states fade in/out based on scroll progress
  const op0 = useTransform(scrollYProgress, [0, 0.2, 0.4, 0.52], [1, 1, 1, 0]);
  const op1 = useTransform(scrollYProgress, [0.4, 0.52, 0.72, 0.84], [0, 1, 1, 0]);
  const op2 = useTransform(scrollYProgress, [0.72, 0.84, 1, 1], [0, 1, 1, 1]);

  return (
    <section ref={sectionRef} className="iph-section">
      <div className="iph-sticky">

        {/* Left: scroll text beats */}
        <div className="iph-beats">
          <div className="iph-beat">
            <p className="eyebrow">Your AI twin</p>
            <h2 className="iph-beat-title">Ready for Instagram</h2>
            <p className="iph-beat-copy">
              Your personalised model generates content that looks like you — styled, lit, and ready to post.
            </p>
          </div>
          <div className="iph-beat">
            <p className="eyebrow">Drop straight into your feed</p>
            <h2 className="iph-beat-title">A full grid, every month</h2>
            <p className="iph-beat-copy">
              20+ scenarios delivered monthly. Editorial, lifestyle, luxury — your directions, your brand.
            </p>
          </div>
          <div className="iph-beat">
            <p className="eyebrow">Content that performs</p>
            <h2 className="iph-beat-title">Grow on autopilot</h2>
            <p className="iph-beat-copy">
              Consistent AI content every month. No camera. No editing. No team. Just results.
            </p>
          </div>
        </div>

        {/* Right: floating iPhone */}
        <div className="iph-phone-wrap">
          <div className="iph-frame">
            {/* Side buttons */}
            <div className="iph-btn-vol-up" />
            <div className="iph-btn-vol-dn" />
            <div className="iph-btn-silent" />
            <div className="iph-btn-power" />

            {/* Dynamic Island */}
            <div className="iph-island" />

            {/* Status bar */}
            <div className="iph-status">
              <span className="iph-time">9:41</span>
              <div className="iph-status-icons">
                <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
                  <rect x="0" y="3" width="3" height="9" rx="1" opacity="0.4"/>
                  <rect x="4" y="2" width="3" height="10" rx="1" opacity="0.6"/>
                  <rect x="8" y="0" width="3" height="12" rx="1" opacity="0.8"/>
                  <rect x="12" y="0" width="3" height="12" rx="1"/>
                </svg>
                <svg width="15" height="12" viewBox="0 0 15 12" fill="currentColor">
                  <path d="M7.5 2.5C9.8 2.5 11.9 3.5 13.3 5L14.5 3.8C12.8 2 10.3 1 7.5 1S2.2 2 0.5 3.8L1.7 5C3.1 3.5 5.2 2.5 7.5 2.5Z" opacity="0.4"/>
                  <path d="M7.5 5C9 5 10.4 5.6 11.4 6.6L12.6 5.4C11.3 4.1 9.5 3.3 7.5 3.3S3.7 4.1 2.4 5.4L3.6 6.6C4.6 5.6 6 5 7.5 5Z" opacity="0.7"/>
                  <circle cx="7.5" cy="10" r="1.5"/>
                </svg>
                <div className="iph-battery">
                  <div className="iph-battery-fill" />
                </div>
              </div>
            </div>

            {/* Screen content */}
            <div className="iph-screen">

              {/* State 0: Instagram profile */}
              <motion.div className="iph-panel" style={{ opacity: op0 }}>
                <div className="iph-ig-header">
                  <span className="iph-ig-handle">youraitwin</span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </div>
                <div className="iph-ig-profile-row">
                  <div className="iph-ig-avatar">
                    <img src={userPhoto} alt="You" />
                  </div>
                  <div className="iph-ig-stats">
                    <div className="iph-ig-stat"><span className="iph-ig-stat-n">248</span><span className="iph-ig-stat-l">posts</span></div>
                    <div className="iph-ig-stat"><span className="iph-ig-stat-n">14.2k</span><span className="iph-ig-stat-l">followers</span></div>
                    <div className="iph-ig-stat"><span className="iph-ig-stat-n">312</span><span className="iph-ig-stat-l">following</span></div>
                  </div>
                </div>
                <div className="iph-ig-bio-name">Your AI Twin ✨</div>
                <div className="iph-ig-bio-text">AI-generated content • OnlyTwins powered</div>
                <div className="iph-ig-follow-btn">Follow</div>
                {/* Story highlights */}
                <div className="iph-ig-stories">
                  {gridPhotos.slice(0, 4).map((src, i) => (
                    <div key={i} className="iph-ig-story">
                      <img src={src} alt="" />
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* State 1: Post grid */}
              <motion.div className="iph-panel" style={{ opacity: op1 }}>
                <div className="iph-ig-header">
                  <span className="iph-ig-handle">youraitwin</span>
                </div>
                <div className="iph-grid">
                  {gridPhotos.map((src, i) => (
                    <div key={i} className="iph-grid-cell">
                      <img src={src} alt="" />
                      {i === 0 && (
                        <div className="iph-grid-you">
                          <img src={userPhoto} alt="You" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* State 2: Single post */}
              <motion.div className="iph-panel" style={{ opacity: op2 }}>
                <div className="iph-post-header">
                  <div className="iph-post-avatar">
                    <img src={userPhoto} alt="You" />
                  </div>
                  <div>
                    <div className="iph-post-name">youraitwin</div>
                    <div className="iph-post-location">AI Generated</div>
                  </div>
                  <span className="iph-post-more">···</span>
                </div>
                <div className="iph-post-img">
                  <img src={gridPhotos[2] ?? gridPhotos[0]} alt="AI post" />
                </div>
                <div className="iph-post-actions">
                  <span className="iph-post-heart">♥</span>
                  <span className="iph-post-comment">💬</span>
                  <span className="iph-post-share">✈</span>
                </div>
                <div className="iph-post-likes">2,841 likes</div>
                <div className="iph-post-caption">
                  <strong>youraitwin</strong> New drop from my AI twin ✨
                </div>
              </motion.div>

            </div>
            <div className="iph-home-bar" />
          </div>
        </div>
      </div>
    </section>
  );
}
