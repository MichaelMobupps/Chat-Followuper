/**
 * Append a rep's personal message template (sign-off) to a generated body.
 * No-op when template is null, empty, or whitespace-only.
 */
export function appendMessageTemplate(
  body: string,
  template: string | null | undefined,
): string {
  const trimmedBody = body.trim();
  const trimmedTemplate = template?.trim();
  if (!trimmedTemplate) return trimmedBody;
  if (!trimmedBody) return trimmedTemplate;
  return `${trimmedBody}\n\n${trimmedTemplate}`;
}