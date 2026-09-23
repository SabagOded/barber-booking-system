export function whatsappDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function israeliMobileToWaDigits(phone: string): string {
  const digits = whatsappDigits(phone);
  if (digits.startsWith("972")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return `972${digits.slice(1)}`;
  }
  return digits;
}

export function buildWhatsAppWalkInConfirmUrl(input: {
  customerPhone: string;
  customerName: string;
  weekday: string;
  dateLabel: string;
  timeLabel: string;
  serviceName: string;
}): string {
  const digits = israeliMobileToWaDigits(input.customerPhone);
  const text = `שלום ${input.customerName}, התור שלך נקבע ל${input.weekday} ${input.dateLabel} בשעה ${input.timeLabel} (${input.serviceName}).`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildWhatsAppRescheduleConfirmUrl(input: {
  customerPhone: string;
  customerName: string;
  weekday: string;
  dateLabel: string;
  timeLabel: string;
  serviceName: string;
}): string {
  const digits = israeliMobileToWaDigits(input.customerPhone);
  const text = `שלום ${input.customerName}, התור שלך הועבר ל${input.weekday} ${input.dateLabel} בשעה ${input.timeLabel} (${input.serviceName}).`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildWhatsAppCustomerUrl(customerPhone: string): string {
  return `https://wa.me/${israeliMobileToWaDigits(customerPhone)}`;
}

export function buildWhatsAppCancelUrl(input: {
  whatsappPhone: string;
  customerName: string;
  serviceName: string;
  dateLabel: string;
  timeLabel: string;
}): string {
  const digits = israeliMobileToWaDigits(input.whatsappPhone);
  const text = [
    "שלום, זו בקשת ביטול תור.",
    `שם: ${input.customerName}`,
    `שירות: ${input.serviceName}`,
    `תאריך: ${input.dateLabel}`,
    `שעה: ${input.timeLabel}`,
  ].join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildWhatsAppBlankCancelUrl(whatsappPhone: string): string {
  const digits = israeliMobileToWaDigits(whatsappPhone);
  const text = ["שלום, אשמח לבטל תור.", "שם:", "טלפון:", "תאריך ושעה:", "שירות:"].join("\n");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
