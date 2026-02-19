/**
 * Image quality checks for lead ingest. Used when FACE_FILTER_ENABLED=true.
 *
 * Requirements (agreed for lead sample images):
 * - Full face visible, no obstructions, not from behind.
 * - Waist-up or portrait: head and upper body at least to waist; not legs-only or full-body-only.
 *
 * Uses Replicate LLaVA for vision. Requires REPLICATE_API_TOKEN.
 */

const FACE_PROMPT =
  "Does this image clearly show at least one person's face (face visible and not obscured, not from behind)? Answer with only: yes or no.";

const WAIST_UP_PROMPT =
  "Is this image a waist-up or portrait shot showing the person's head and upper body (at least to the waist), rather than full body or legs only? Answer with only: yes or no.";

function parseYesNo(output: string | string[]): boolean {
  const text = (Array.isArray(output) ? output.join(" ") : String(output ?? "")).trim().toLowerCase();
  return text.startsWith("yes") || text.includes(" yes");
}

export async function hasClearFace(imageUrl: string): Promise<boolean> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) return true;
  try {
    const Replicate = (await import("replicate")).default;
    const replicate = new Replicate({ auth: token });
    const output = (await replicate.run("yorickvp/llava-13b", {
      input: {
        image: imageUrl,
        prompt: FACE_PROMPT,
        max_tokens: 20,
      },
    })) as string | string[];
    return parseYesNo(output);
  } catch {
    return false;
  }
}

export async function isWaistUp(imageUrl: string): Promise<boolean> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) return true;
  try {
    const Replicate = (await import("replicate")).default;
    const replicate = new Replicate({ auth: token });
    const output = (await replicate.run("yorickvp/llava-13b", {
      input: {
        image: imageUrl,
        prompt: WAIST_UP_PROMPT,
        max_tokens: 20,
      },
    })) as string | string[];
    return parseYesNo(output);
  } catch {
    return false;
  }
}

export async function passesFaceAndWaistUp(imageUrl: string): Promise<boolean> {
  const [face, waistUp] = await Promise.all([hasClearFace(imageUrl), isWaistUp(imageUrl)]);
  return face && waistUp;
}
