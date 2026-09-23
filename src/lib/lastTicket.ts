export type LastTicket = {
  appointmentId?: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  startAt: string;
  shopName: string;
  endAt: string;
};

export const LAST_TICKET_KEY = "booking.lastTicket";
export const LEGACY_LAST_TICKET_KEY = "barber.lastTicket";

export function readLastTicketStorage(): string | null {
  try {
    return localStorage.getItem(LAST_TICKET_KEY) ?? localStorage.getItem(LEGACY_LAST_TICKET_KEY);
  } catch {
    return null;
  }
}

export function writeLastTicketStorage(ticket: LastTicket): boolean {
  try {
    localStorage.setItem(LAST_TICKET_KEY, JSON.stringify(ticket));
  } catch {
    return false;
  }
  try {
    localStorage.removeItem(LEGACY_LAST_TICKET_KEY);
  } catch {
    // The new ticket is already stored; legacy cleanup is best effort.
  }
  return true;
}

export function removeLastTicketStorage(): void {
  try {
    localStorage.removeItem(LAST_TICKET_KEY);
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
  try {
    localStorage.removeItem(LEGACY_LAST_TICKET_KEY);
  } catch {
    // Storage cleanup is best effort.
  }
}

export function parseLastTicket(raw: string | null | undefined): LastTicket | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<LastTicket>;
    if (!parsed.startAt || !parsed.customerName || !parsed.serviceName || !parsed.shopName) {
      return null;
    }
    const start = new Date(parsed.startAt);
    if (Number.isNaN(start.getTime())) {
      return null;
    }
    return {
      appointmentId:
        typeof parsed.appointmentId === "string" && parsed.appointmentId.trim()
          ? parsed.appointmentId.trim()
          : undefined,
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone ?? "",
      serviceName: parsed.serviceName,
      startAt: parsed.startAt,
      shopName: parsed.shopName,
      endAt:
        parsed.endAt ?? new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export function isUpcomingTicket(ticket: LastTicket, now = new Date()): boolean {
  return new Date(ticket.startAt).getTime() > now.getTime();
}

export function withCurrentTicketTime(
  ticket: LastTicket,
  current: { startAtIso: string; endAtIso: string },
): LastTicket {
  return { ...ticket, startAt: current.startAtIso, endAt: current.endAtIso };
}
