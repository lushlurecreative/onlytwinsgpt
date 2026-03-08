type GalleryCapabilitiesRowProps = {
  title: string;
  items: string[];
};

export default function GalleryCapabilitiesRow({ title, items }: GalleryCapabilitiesRowProps) {
  return (
    <section className="gallery-capabilities">
      <h2>{title}</h2>
      <div className="gallery-capabilities-chips">
        {items.map((item) => (
          <span key={item} className="gallery-capability-chip">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}
