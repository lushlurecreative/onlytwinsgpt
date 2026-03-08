"use client";

type BlurredNSFWCardProps = {
  isNSFW: boolean;
  title: string;
  revealed: boolean;
  showPreview: boolean;
  onReveal: () => void;
  children: React.ReactNode;
};

export default function BlurredNSFWCard({
  isNSFW,
  title,
  revealed,
  showPreview,
  onReveal,
  children,
}: BlurredNSFWCardProps) {
  const hidden = isNSFW && !showPreview && !revealed;

  return (
    <div className={`nsfw-wrap ${hidden ? "is-hidden" : ""}`.trim()}>
      {children}
      {hidden ? (
        <button
          type="button"
          className="nsfw-overlay"
          onClick={onReveal}
          aria-label={`Reveal NSFW example: ${title}`}
        >
          <strong>NSFW Example</strong>
          <span>Click to reveal</span>
        </button>
      ) : null}
    </div>
  );
}
