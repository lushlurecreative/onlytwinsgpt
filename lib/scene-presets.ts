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
      "A woman standing on a sandy beach at golden hour, ocean waves behind her, natural daylight, warm skin tones, looking toward the camera.",
  },
  {
    key: "camping",
    label: "Camping",
    prompt:
      "A woman sitting by a campfire in a forest campsite, natural golden-hour light on her face, trees in the background, relaxed outdoor lifestyle pose.",
  },
  {
    key: "coffee_shop",
    label: "Coffee shop",
    prompt:
      "A woman sitting at a table in a modern coffee shop, holding a coffee cup, natural indoor lighting, soft smile, candid lifestyle framing.",
  },
  {
    key: "swimsuit_try_on",
    label: "Swimsuit try-on",
    prompt:
      "A woman in a swimsuit posing in a clean bright studio setting, natural skin detail, confident relaxed pose, commercial-grade clarity.",
  },
  {
    key: "gym",
    label: "Gym",
    prompt:
      "A woman in athletic wear working out in a premium gym, natural lighting, fitness context, sharp focus on her face and figure.",
  },
  {
    key: "casual_home",
    label: "Casual home",
    prompt:
      "A woman relaxing in a casual home setting, warm natural light from a window, cozy interior, everyday lifestyle pose, looking at the camera.",
  },
  {
    key: "street_style",
    label: "Street style",
    prompt:
      "A woman walking on a city sidewalk in a fashionable outfit, urban buildings in the background, fashion-forward framing, natural daylight.",
  },
  {
    key: "nightlife",
    label: "Nightlife",
    prompt:
      "A woman at a rooftop bar at night, cinematic low-light with warm ambient tones, confident expression, sharp subject detail.",
  },
  {
    key: "city",
    label: "City",
    prompt:
      "A woman standing in a polished city setting, modern architecture behind her, editorial quality lighting, natural perspective.",
  },
];

export function getScenePresetByKey(key: string) {
  return SCENE_PRESETS.find((s) => s.key === key);
}

