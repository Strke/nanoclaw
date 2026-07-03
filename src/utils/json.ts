/**
 * Shared utility: safely parse JSON content.
 */
export function safeParseContent(
  raw: string,
): { text?: string; sender?: string; senderId?: string; [key: string]: unknown } {
  try {
    return JSON.parse(raw);
  } catch {
    return { text: raw };
  }
}
