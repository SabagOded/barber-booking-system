import { prisma } from "./prisma";

export type PublicTicketStatus = "scheduled" | "cancelled" | "missing";

export function isLiveTicketStatus(status: PublicTicketStatus): boolean {
  return status === "scheduled";
}

export async function getPublicTicketStatus(input: {
  id: string;
}): Promise<
  | { status: "scheduled"; startAtIso: string; endAtIso: string }
  | { status: "cancelled" | "missing" }
> {
  const id = input.id.trim();
  if (!id) {
    return { status: "missing" };
  }

  const row = await prisma.appointment.findUnique({
    where: { id },
    select: { status: true, startAt: true, endAt: true },
  });

  if (!row) {
    return { status: "missing" };
  }
  if (row.status === "scheduled") {
    return { status: "scheduled", startAtIso: row.startAt.toISOString(), endAtIso: row.endAt.toISOString() };
  }
  if (row.status === "cancelled") {
    return { status: "cancelled" };
  }
  return { status: "missing" };
}
