export const IMPLEMENTER_RESET_SUBJECT = "בקשת איפוס סיסמת ניהול";

function resetDraft(email: string, businessName = "") {
  const address = email.trim();
  if (!address) {
    return null;
  }
  const shopLine = businessName.trim() ? `שם החנות: ${businessName.trim()}` : "שם החנות:";
  const body = ["שלום, אשמח לאיפוס סיסמת ניהול למערכת התורים.", shopLine].join("\n");
  return { address, subject: IMPLEMENTER_RESET_SUBJECT, body };
}

export function buildImplementerMailto(email: string, businessName = ""): string {
  const draft = resetDraft(email, businessName);
  if (!draft) {
    return "";
  }
  return `mailto:${draft.address}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}

export function buildImplementerGmailUrl(email: string, businessName = ""): string {
  const draft = resetDraft(email, businessName);
  if (!draft) {
    return "";
  }
  return [
    "https://mail.google.com/mail/?view=cm&fs=1",
    `to=${encodeURIComponent(draft.address)}`,
    `su=${encodeURIComponent(draft.subject)}`,
    `body=${encodeURIComponent(draft.body)}`,
  ].join("&");
}
