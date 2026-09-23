import Image from "next/image";
import {
  customLogoDisplayClassName,
  type LogoDisplaySize,
  type LogoPlacement,
} from "@/lib/media/logoDisplay";

/* eslint-disable @next/next/no-img-element -- custom logos are pre-optimized and may use a future storage provider */

export function ShopMark({
  placement,
  priority = false,
  logoUrl = null,
  logoDisplaySize = "medium",
}: {
  placement: LogoPlacement;
  priority?: boolean;
  logoUrl?: string | null;
  logoDisplaySize?: LogoDisplaySize;
}) {
  const className = logoUrl
    ? customLogoDisplayClassName(logoDisplaySize, placement)
    : placement === "hero"
      ? "h-24 w-24 p-2"
      : "h-8 w-8 shrink-0 p-1";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${className}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="h-full w-full object-contain" aria-hidden="true" />
      ) : (
        <Image
          src="/shop-mark.png"
          alt=""
          width={160}
          height={160}
          priority={priority}
          className="h-full w-full object-contain"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
