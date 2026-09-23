export class BookingValidationError extends Error {
  readonly field: "name" | "phone" | "startAt";

  constructor(field: "name" | "phone" | "startAt", message: string) {
    super(message);
    this.name = "BookingValidationError";
    this.field = field;
  }
}

export function normalizeCustomerName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

const HAS_DIGIT = /\p{Nd}/u;
export const MAX_CUSTOMER_NAME_LENGTH = 80;

export function isFullName(raw: string): boolean {
  const name = normalizeCustomerName(raw);
  if (!name || name.length > MAX_CUSTOMER_NAME_LENGTH || HAS_DIGIT.test(name)) {
    return false;
  }
  return name.split(" ").filter(Boolean).length >= 2;
}

export function normalizeIsraeliPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  let national: string | undefined;

  if (digits.startsWith("9725") && digits.length === 12) {
    national = `0${digits.slice(3)}`;
  } else if (digits.startsWith("05") && digits.length === 10) {
    national = digits;
  } else if (digits.startsWith("5") && digits.length === 9) {
    national = `0${digits}`;
  }

  if (!national || !/^05\d{8}$/.test(national)) {
    throw new BookingValidationError("phone", "Invalid Israeli mobile number");
  }

  return national;
}
