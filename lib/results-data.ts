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
    before: "/results/before/Slider%201.jpg",
    after: "/results/after/Slider%201.jpg",
    title: "Lifestyle Transformation",
    category: "Lifestyle",
    description: "Real before/after pair wired from your uploaded results folders.",
  },
  {
    id: "result-2",
    before: "/results/before/Slider%202.jpg",
    after: "/results/after/Slider%202.jpg",
    title: "Social Media Transformation",
    category: "Instagram",
    description: "Real before/after pair wired from your uploaded results folders.",
  },
  {
    id: "result-3",
    before: "/results/before/Slider%203.jpg",
    after: "/results/after/Slider%203.jpg",
    title: "Premium Twin Transformation",
    category: "Luxury",
    description: "Real before/after pair wired from your uploaded results folders.",
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
