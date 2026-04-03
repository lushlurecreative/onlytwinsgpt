/**
 * ComfyUI API client for InfiniteYou identity-preserving generation.
 * Talks to a running ComfyUI instance via HTTP API.
 *
 * Node input names discovered from the live pod via /object_info.
 */

const USER_AGENT = "OnlyTwins/1.0";

const NEGATIVE_PROMPT =
  "blurry, deformed, ugly, bad anatomy, bad eyes, crossed eyes, disfigured, " +
  "poorly drawn face, mutation, extra limb, cartoon, anime, drawing, painting";

// ---------------------------------------------------------------------------
// Low-level HTTP helpers
// ---------------------------------------------------------------------------

async function comfyGet(serverUrl: string, path: string): Promise<unknown> {
  const res = await fetch(`${serverUrl}${path}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`ComfyUI GET ${path}: ${res.status}`);
  return res.json();
}

async function comfyPostJson(
  serverUrl: string,
  path: string,
  body: unknown
): Promise<unknown> {
  const res = await fetch(`${serverUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI POST ${path}: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check if ComfyUI server is reachable. */
export async function checkComfyUIHealth(
  serverUrl: string
): Promise<{ ok: boolean; vramGb?: number; error?: string }> {
  try {
    const stats = (await comfyGet(serverUrl, "/system_stats")) as {
      devices?: { vram_total?: number }[];
    };
    const vram = (stats.devices?.[0]?.vram_total ?? 0) / 1024 ** 3;
    return { ok: true, vramGb: Math.round(vram * 10) / 10 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Upload a source photo to ComfyUI's /input directory. */
export async function uploadImageToComfyUI(
  serverUrl: string,
  imageBuffer: Buffer,
  filename = "source_photo.png"
): Promise<string> {
  const boundary = crypto.randomUUID().replace(/-/g, "");

  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
  );
  const mid = Buffer.from(
    `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="overwrite"\r\n\r\n` +
      `true\r\n`
  );
  const tail = Buffer.from(`--${boundary}--\r\n`);
  const body = Buffer.concat([head, imageBuffer, mid, tail]);

  const res = await fetch(`${serverUrl}/upload/image`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "User-Agent": USER_AGENT,
    },
    body,
  });

  if (!res.ok) throw new Error(`ComfyUI image upload failed: ${res.status}`);
  const data = (await res.json()) as { name?: string };
  return data.name || filename;
}

/** Build the API-format prompt for one InfiniteYou generation. */
export function buildInfiniteYouPrompt(
  imageName: string,
  scenePrompt: string
): Record<string, unknown> {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "flux1-dev.safetensors", weight_dtype: "fp8_e4m3fn_fast" },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: "t5xxl_fp8_e4m3fn.safetensors",
        clip_name2: "clip_l.safetensors",
        type: "flux",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: "ae.safetensors" },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: imageName },
    },
    "5": {
      class_type: "IDEmbeddingModelLoader",
      inputs: {
        image_proj_model_name: "sim_stage1/image_proj_model.bin",
        image_proj_num_tokens: 8,
        face_analysis_provider: "CUDA",
        face_analysis_det_size: "640",
      },
    },
    "6": {
      class_type: "ExtractIDEmbedding",
      inputs: {
        face_detector: ["5", 0],
        arcface_model: ["5", 1],
        image_proj_model: ["5", 2],
        image: ["4", 0],
      },
    },
    "7": {
      class_type: "CLIPTextEncodeFlux",
      inputs: {
        clip: ["2", 0],
        clip_l: scenePrompt,
        t5xxl: scenePrompt,
        guidance: 3.5,
      },
    },
    "8": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["2", 0], text: NEGATIVE_PROMPT },
    },
    "9": {
      class_type: "EmptyImage",
      inputs: { width: 864, height: 1152, batch_size: 1, color: 0 },
    },
    "10": {
      class_type: "InfuseNetLoader",
      inputs: { controlnet_name: "sim_stage1/infusenet_sim_fp8e4m3fn.safetensors" },
    },
    "11": {
      class_type: "InfuseNetApply",
      inputs: {
        positive: ["7", 0],
        id_embedding: ["6", 0],
        control_net: ["10", 0],
        image: ["9", 0],
        negative: ["8", 0],
        vae: ["3", 0],
        strength: 1.0,
        start_percent: 0.0,
        end_percent: 1.0,
      },
    },
    "12": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0],
        positive: ["11", 0],
        negative: ["11", 1],
        latent_image: ["13", 0],
        seed: Math.floor(Math.random() * 2 ** 32),
        control_after_generate: "randomize",
        steps: 28,
        cfg: 1.0,
        sampler_name: "euler",
        scheduler: "simple",
        denoise: 1.0,
      },
    },
    "13": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "14": {
      class_type: "VAEDecode",
      inputs: { samples: ["12", 0], vae: ["3", 0] },
    },
    "15": {
      class_type: "SaveImage",
      inputs: { images: ["14", 0], filename_prefix: "onlytwins_preview" },
    },
  };
}

/** Queue a prompt on ComfyUI. Returns the prompt ID. */
export async function queuePrompt(
  serverUrl: string,
  prompt: Record<string, unknown>
): Promise<string> {
  const clientId = crypto.randomUUID();
  const result = (await comfyPostJson(serverUrl, "/prompt", {
    prompt,
    client_id: clientId,
  })) as { prompt_id?: string; node_errors?: Record<string, unknown> };

  if (result.node_errors && Object.keys(result.node_errors).length > 0) {
    throw new Error(
      `ComfyUI validation: ${JSON.stringify(result.node_errors).slice(0, 500)}`
    );
  }
  if (!result.prompt_id) {
    throw new Error("ComfyUI returned no prompt_id");
  }
  return result.prompt_id;
}

/** Poll /history until the prompt completes. Returns the history entry. */
export async function waitForCompletion(
  serverUrl: string,
  promptId: string,
  timeoutMs = 120_000
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const history = (await comfyGet(
        serverUrl,
        `/history/${promptId}`
      )) as Record<string, { outputs?: unknown; status?: { status_str?: string; messages?: unknown[] } }>;

      const entry = history[promptId];
      if (entry) {
        if (entry.status?.status_str === "error") {
          throw new Error(
            `ComfyUI error: ${JSON.stringify(entry.status.messages ?? []).slice(0, 500)}`
          );
        }
        if (entry.outputs) return entry as Record<string, unknown>;
      }
    } catch (e) {
      // Re-throw ComfyUI errors, swallow transient fetch errors
      if (e instanceof Error && e.message.startsWith("ComfyUI error")) throw e;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`ComfyUI timed out after ${timeoutMs}ms`);
}

/** Download the first output image from a completed history entry. */
export async function downloadOutput(
  serverUrl: string,
  historyEntry: Record<string, unknown>
): Promise<Buffer> {
  const outputs = (historyEntry as { outputs?: Record<string, { images?: { filename: string; subfolder?: string; type?: string }[] }> }).outputs ?? {};
  for (const nodeOut of Object.values(outputs)) {
    for (const img of nodeOut.images ?? []) {
      const params = new URLSearchParams({
        filename: img.filename,
        subfolder: img.subfolder || "",
        type: img.type || "output",
      });
      const res = await fetch(`${serverUrl}/view?${params}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    }
  }
  throw new Error("No output images in ComfyUI history");
}

/**
 * High-level: generate one InfiniteYou image from a face photo + scene prompt.
 * Handles upload → queue → poll → download in one call.
 */
export async function generateInfiniteYou(
  serverUrl: string,
  imageBuffer: Buffer,
  scenePrompt: string
): Promise<Buffer> {
  const imageName = await uploadImageToComfyUI(serverUrl, imageBuffer);
  const prompt = buildInfiniteYouPrompt(imageName, scenePrompt);
  const promptId = await queuePrompt(serverUrl, prompt);
  const history = await waitForCompletion(serverUrl, promptId);
  return downloadOutput(serverUrl, history);
}
