import BrandName from "@/app/components/BrandName";
import AuthAwarePrimaryCta from "@/components/AuthAwarePrimaryCta";
import { WHATSAPP_LINK, WHATSAPP_NUMBER_DISPLAY } from "@/lib/support";

const faqs = [
  {
    q: "What is this service?",
    a: "It is a done-for-you AI content service. You subscribe, send samples, and we deliver finished monthly content.",
  },
  {
    q: "Do I need to do any technical setup myself?",
    a: "No. We handle model training and content production for you.",
  },
  {
    q: "What do I need to provide?",
    a: "You provide sample photos and brand direction. We do the rest.",
  },
  {
    q: "How is content delivered?",
    a: "Delivery is handled on a monthly schedule based on your selected package.",
  },
  {
    q: "Can agencies subscribe for clients?",
    a: "Yes. We support both independent creators and agencies managing multiple brands.",
  },
  {
    q: "Which AI tools/models do you use?",
    a: "Our pipeline currently uses OpenAI image generation with a managed post-processing stack. Video generation runs through an approval queue and provider routing configured by the admin team.",
  },
  {
    q: "Do you remove AI metadata and inject camera metadata?",
    a: "Yes. Generated image outputs pass through an automated metadata pipeline that scrubs AI papertrail data and applies delivery metadata before publishing.",
  },
  {
    q: "What payment methods are available?",
    a: "Stripe card checkout and Bitcoin checkout are supported now. Amazon Pay is not active in this release.",
  },
];

export default function FaqPage() {
  return (
    <div>
      <section className="hero">
        <p className="eyebrow">FAQ</p>
        <h1>
          Common questions about <BrandName />.
        </h1>
        <p>No jargon, no confusion, no runaround.</p>
      </section>

      <section className="section feature-grid">
        {faqs.map((item) => (
          <article key={item.q} className="card">
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </article>
        ))}
      </section>

      <section className="section card">
        <h3>Still have questions?</h3>
        <div className="cta-row">
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            WhatsApp: {WHATSAPP_NUMBER_DISPLAY}
          </a>
          <AuthAwarePrimaryCta className="btn btn-primary" />
        </div>
      </section>
    </div>
  );
}

