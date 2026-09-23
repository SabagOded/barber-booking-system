import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShopMark } from "./ShopMark";

describe("public shop logo", () => {
  it("uses the medium size by default for a custom logo and preserves contain", () => {
    const html = renderToStaticMarkup(
      <ShopMark placement="hero" logoUrl="/media/logo/example.webp" />,
    );

    expect(html).toContain("h-24 w-40");
    expect(html).toContain("object-contain");
    expect(html).toContain("/media/logo/example.webp");
  });

  it("maps the selected safe size in the booking header", () => {
    const html = renderToStaticMarkup(
      <ShopMark
        placement="header"
        logoUrl="/media/logo/example.webp"
        logoDisplaySize="large"
      />,
    );

    expect(html).toContain("h-10 w-20");
  });

  it("keeps the existing fallback mark and fallback dimensions", () => {
    const html = renderToStaticMarkup(<ShopMark placement="hero" />);

    expect(html).toContain("shop-mark.png");
    expect(html).toContain("h-24 w-24 p-2");
  });
});
