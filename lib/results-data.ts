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
  placeholder?: boolean;
};

export const resultsItems: ResultsItem[] = [
  {
    id: "result-real-1",
    before: "/results/before/photo_2026-01-11_19-07-02.jpg",
    after: "/results/after/photo_2026-03-04_14-02-02.jpg",
    title: "Real Twin Transformation",
    category: "Lifestyle",
    description: "Live before/after pair from uploaded training and generated output.",
  },
  {
    id: "result-1",
    before: "/hero-before.svg",
    after: "/hero-after.svg",
    title: "Luxury Editorial Transformation",
    category: "Luxury",
    description:
      "Starter visible sample. Replace with your own pair in /public/results/before and /public/results/after.",
    placeholder: true,
  },
  {
    id: "result-2",
    before: "/hero-before.svg",
    after: "/hero-after-city.svg",
    title: "Vacation Lifestyle Look",
    category: "Vacation",
    description:
      "Starter visible sample. Replace with your own pair in /public/results/before and /public/results/after.",
    placeholder: true,
  },
  {
    id: "result-3",
    before: "/hero-before.svg",
    after: "/hero-after-gym.svg",
    title: "Instagram Social Polish",
    category: "Instagram",
    description:
      "Starter visible sample. Replace with your own pair in /public/results/before and /public/results/after.",
    placeholder: true,
  },
  {
    id: "result-4",
    before: "/hero-before.svg",
    after: "/hero-after.svg",
    title: "Fitness / Gym Direction",
    category: "Gym",
    description:
      "Starter visible sample. Replace with your own pair in /public/results/before and /public/results/after.",
    placeholder: true,
  },
];

export const featuredResultsItems: ResultsItem[] = resultsItems.slice(0, 4);
