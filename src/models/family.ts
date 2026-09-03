export function modelFamily(modelId: string): string {
  return modelId.toLowerCase().replace(/^orvix\//, "").split("-", 1)[0] || "orvixai";
}
