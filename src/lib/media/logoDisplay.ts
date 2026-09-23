export const LOGO_DISPLAY_SIZES = ["small", "medium", "large"] as const;
export type LogoDisplaySize = (typeof LOGO_DISPLAY_SIZES)[number];
export type LogoPlacement = "header" | "hero";

const CUSTOM_LOGO_CLASSES: Record<LogoPlacement, Record<LogoDisplaySize, string>> = {
  header: {
    small: "h-6 w-12",
    medium: "h-8 w-16",
    large: "h-10 w-20",
  },
  hero: {
    small: "h-16 w-28",
    medium: "h-24 w-40",
    large: "h-32 w-56 max-w-[80vw]",
  },
};

export function customLogoDisplayClassName(
  size: LogoDisplaySize,
  placement: LogoPlacement,
): string {
  return CUSTOM_LOGO_CLASSES[placement][size];
}
