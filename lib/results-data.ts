export type ResultsItem = {
  id: string;
  before: string;
  after: string;
  title: string;
  category:
    | "Luxury"
    | "Lifestyle"
    | "Vacation"
    | "Goth"
    | "Gym"
    | "Instagram"
    | "Cosplay"
    | "SFW"
    | "NSFW";
  description: string;
  nsfw?: boolean;
};

export const resultsItems: ResultsItem[] = [
  {
    id: "result-1",
    before: "/results/before/slider-1.jpg",
    after: "/results/after/slider-1.jpg",
    title: "Lifestyle Transformation",
    category: "Lifestyle",
    description: "Natural social lifestyle direction with consistent identity and high visual realism.",
  },
  {
    id: "result-2",
    before: "/results/before/slider-2.jpg",
    after: "/results/after/slider-2.jpg",
    title: "Fitness Direction Transformation",
    category: "Gym",
    description: "Activewear and training-focused result style for fitness-facing creator content.",
  },
  {
    id: "result-3",
    before: "/results/before/slider-3.jpg",
    after: "/results/after/slider-3.jpg",
    title: "Alternative Mood Transformation",
    category: "Goth",
    description: "Darker mood styling with controlled atmosphere while keeping facial consistency.",
  },
  {
    id: "result-4",
    before: "/results/before/slider-4.jpg",
    after: "/results/after/slider-4.jpg",
    title: "Goth Aesthetic Transformation",
    category: "Goth",
    description: "Strong alternative visual direction with dramatic look and premium output quality.",
  },
  {
    id: "result-5",
    before: "/results/before/slider-5.jpg",
    after: "/results/after/slider-5.jpg",
    title: "NSFW Transformation",
    category: "NSFW",
    description: "Adult-oriented transformation with controlled style direction and identity consistency.",
    nsfw: true,
  },
  {
    id: "result-6",
    before: "/results/before/slider-6.jpg",
    after: "/results/after/slider-6.jpg",
    title: "Social Media Transformation",
    category: "Instagram",
    description: "Platform-ready social media style tuned for feed consistency and polished output.",
  },
];

export const resultsItemTemplate: ResultsItem = {
  id: "result-1",
  before: "/results/before/model-01-before.jpg",
  after: "/results/after/model-01-after.jpg",
  title: "Luxury Editorial Transformation",
  category: "Luxury",
  description: "From source training photo to polished editorial-style twin output.",
};

export const featuredResultsItems: ResultsItem[] = resultsItems.slice(0, 4);
