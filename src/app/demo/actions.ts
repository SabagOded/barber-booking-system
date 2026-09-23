"use server";

import { revalidatePath } from "next/cache";
import { resetDemoManually } from "@/lib/demoReset";

export async function resetDemoAction(): Promise<void> {
  if (await resetDemoManually()) revalidatePath("/", "layout");
}
