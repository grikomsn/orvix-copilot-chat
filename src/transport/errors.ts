export async function apiError(prefix: string, response: Response): Promise<Error> {
  const text = (await response.text().catch(() => "")).trim();
  let detail = text;
  try {
    const json = JSON.parse(text) as {
      error?: { message?: string } | string;
      detail?: string;
      message?: string;
      title?: string;
    };
    detail =
      typeof json.error === "string"
        ? json.error
        : json.error?.message ?? json.detail ?? json.message ?? json.title ?? text;
  } catch {
    /* Use the response text as-is. */
  }
  return new Error(`${prefix} (HTTP ${response.status})${detail ? `: ${detail.slice(0, 1000)}` : ""}`);
}
