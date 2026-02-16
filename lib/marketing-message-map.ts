export const MARKETING_MESSAGE_MAP = {
  positioning: {
    eyebrow: "Done-For-You AI Content Service",
    headline:
      "You subscribe, upload sample photos, and receive finished AI content every month.",
    subheadline:
      "We are a content production service. We train custom LoRA models from your samples and deliver ready-to-use results.",
  },
  cta: {
    primaryLabel: "Start Subscription",
    primaryHref: "/pricing",
    secondaryLabel: "Contact Us",
    secondaryHref: "/contact",
  },
  process: [
    {
      title: "Subscribe",
      detail: "Choose your monthly package and we confirm your onboarding details.",
    },
    {
      title: "Upload Samples",
      detail: "You send sample photos in your private upload vault so we can train your model.",
    },
    {
      title: "Receive Content",
      detail: "We deliver finished AI content on your monthly schedule.",
    },
  ],
} as const;

