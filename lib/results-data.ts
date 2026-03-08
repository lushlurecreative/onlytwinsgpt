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
    before: "/results/before/model-01-before.jpg",
    after: "/results/after/model-01-after.jpg",
    title: "Luxury Editorial Transformation",
    category: "Luxury",
    description: "From source training photo to polished editorial-style twin output.",
  },
  {
    id: "result-2",
    before: "/results/before/model-02-before.jpg",
    after: "/results/after/model-02-after.jpg",
    title: "Vacation Lifestyle Look",
    category: "Vacation",
    description: "Travel-style transformation with premium lighting and environment.",
  },
  {
    id: "result-3",
    before: "/results/before/model-03-before.jpg",
    after: "/results/after/model-03-after.jpg",
    title: "Instagram Social Polish",
    category: "Instagram",
    description: "Platform-ready result tuned for consistent social aesthetics.",
  },
  {
    id: "result-4",
    before: "/results/before/model-04-before.jpg",
    after: "/results/after/model-04-after.jpg",
    title: "Fitness / Gym Direction",
    category: "Gym",
    description: "High-energy active visual style with realistic details and identity retention.",
  },
  {
    id: "result-5",
    before: "/results/before/model-05-before.jpg",
    after: "/results/after/model-05-after.jpg",
    title: "Alternative Goth Style",
    category: "Goth",
    description: "Dark mood transformation with controlled atmosphere and styling.",
  },
  {
    id: "result-6",
    before: "/results/before/model-06-before.jpg",
    after: "/results/after/model-06-after.jpg",
    title: "Premium NSFW Style",
    category: "NSFW",
    description: "Adult-oriented output controlled for mood, quality, and visual consistency.",
    nsfw: true,
  },
];

export const featuredResultsItems: ResultsItem[] = resultsItems.slice(0, 4);
