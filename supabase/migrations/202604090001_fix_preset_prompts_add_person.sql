-- Fix preset prompts: add explicit human subject to every scene.
-- Root cause: all 9 prompts described only environments with no person,
-- causing FLUX to generate empty rooms and FaceFusion to fail (no face to swap).

UPDATE presets SET prompt = 'A woman standing on a sandy beach at golden hour, ocean waves behind her, natural daylight, warm skin tones, looking toward the camera.' WHERE name ILIKE 'Beach';
UPDATE presets SET prompt = 'A woman sitting by a campfire in a forest campsite, natural golden-hour light on her face, trees in the background, relaxed outdoor lifestyle pose.' WHERE name ILIKE 'Camping';
UPDATE presets SET prompt = 'A woman sitting at a table in a modern coffee shop, holding a coffee cup, natural indoor lighting, soft smile, candid lifestyle framing.' WHERE name ILIKE 'Coffee shop';
UPDATE presets SET prompt = 'A woman in a swimsuit posing in a clean bright studio setting, natural skin detail, confident relaxed pose, commercial-grade clarity.' WHERE name ILIKE 'Swimsuit try-on';
UPDATE presets SET prompt = 'A woman in athletic wear working out in a premium gym, natural lighting, fitness context, sharp focus on her face and figure.' WHERE name ILIKE 'Gym';
UPDATE presets SET prompt = 'A woman relaxing in a casual home setting, warm natural light from a window, cozy interior, everyday lifestyle pose, looking at the camera.' WHERE name ILIKE 'Casual home';
UPDATE presets SET prompt = 'A woman walking on a city sidewalk in a fashionable outfit, urban buildings in the background, fashion-forward framing, natural daylight.' WHERE name ILIKE 'Street style';
UPDATE presets SET prompt = 'A woman at a rooftop bar at night, cinematic low-light with warm ambient tones, confident expression, sharp subject detail.' WHERE name ILIKE 'Nightlife';
UPDATE presets SET prompt = 'A woman standing in a polished city setting, modern architecture behind her, editorial quality lighting, natural perspective.' WHERE name ILIKE 'City';
