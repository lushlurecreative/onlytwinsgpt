export function isGenerationEngineEnabled() {
  return (process.env.GENERATION_ENGINE_ENABLED ?? "").trim().toLowerCase() === "true";
}

export function logGenerationEngineDisabled(context: string) {
  console.log("generation engine disabled", { context });
}

