export type ScenePresetKey =
  | "beach"
  | "camping"
  | "coffee_shop"
  | "swimsuit_try_on"
  | "gym"
  | "casual_home"
  | "street_style"
  | "nightlife"
  | "city";

export type ScenePreset = {
  key: ScenePresetKey;
  label: string;
  prompt: string;
};

export const SCENE_PRESETS: ScenePreset[] = [
  {
    key: "beach",
    label: "Beach",
    prompt:
      "A realistic beach scene with natural daylight, ocean water movement, and authentic skin texture.",
  },
  {
    key: "camping",
    label: "Camping",
    prompt:
      "An outdoor camping scene with natural environment details, realistic lighting, and lifestyle composition.",
  },
  {
    key: "coffee_shop",
    label: "Coffee shop",
    prompt:
      "A modern coffee shop scene with natural indoor lighting, realistic depth, and candid lifestyle framing.",
  },
  {
    key: "swimsuit_try_on",
    label: "Swimsuit try-on",
    prompt:
      "A clean lifestyle try-on scene with realistic body proportions, natural skin detail, and commercial-grade clarity.",
  },
  {
    key: "gym",
    label: "Gym",
    prompt:
      "A premium gym environment with realistic fitness context, natural lighting, and crisp, authentic detail.",
  },
  {
    key: "casual_home",
    label: "Casual home",
    prompt:
      "A casual home setting with warm natural light, realistic textures, and everyday lifestyle composition.",
  },
  {
    key: "street_style",
    label: "Street style",
    prompt:
      "A street-style city look with realistic urban background, fashion-forward framing, and natural detail.",
  },
  {
    key: "nightlife",
    label: "Nightlife",
    prompt:
      "A nightlife environment with cinematic but realistic low-light tones and sharp subject consistency.",
  },
  {
    key: "city",
    label: "City",
    prompt:
      "A polished city environment with realistic architecture, natural perspective, and editorial quality lighting.",
  },
];

export function getScenePresetByKey(key: string) {
  return SCENE_PRESETS.find((s) => s.key === key);
}

