import type { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";

type ToastFn = ReturnType<typeof useToast>["toast"];

/**
 * Friendly 409 handling for duplicate phone / Telegram handle / LinkedIn URL.
 * Returns true when the error was a known duplicate (toast shown).
 */
export function toastDuplicateContactError(
  err: unknown,
  toast: ToastFn,
): boolean {
  const apiCode = err instanceof ApiError ? err.code : undefined;
  if (apiCode === "duplicate_phone") {
    toast({
      title: "Already in your list",
      description:
        "A contact with this phone number is already saved. Check Contacts or Today.",
    });
    return true;
  }
  if (apiCode === "duplicate_telegram_handle") {
    toast({
      title: "Already in your list",
      description:
        "A contact with this Telegram handle is already saved. Check Contacts or Today.",
    });
    return true;
  }
  if (apiCode === "duplicate_linkedin_url") {
    toast({
      title: "Already in your list",
      description:
        "A contact with this LinkedIn profile is already saved. Check Contacts or Today.",
    });
    return true;
  }
  return false;
}