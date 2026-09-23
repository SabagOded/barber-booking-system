import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioGallery } from "./PortfolioGallery";

describe("public portfolio gallery", () => {
  it("renders nothing when no portfolio images exist", () => {
    expect(renderToStaticMarkup(<PortfolioGallery images={[]} />)).toBe("");
  });

  it("renders the compact preview and focal positions", () => {
    const html = renderToStaticMarkup(
      <PortfolioGallery
        images={[
          { id: "one", url: "/media/one.webp", focalX: 15, focalY: 85 },
          { id: "two", url: "/media/two.webp", focalX: 50, focalY: 50 },
        ]}
      />,
    );
    expect(html).toContain("עבודות נבחרות");
    expect(html).toContain("object-position:15% 85%");
    expect(html).toContain("פתיחת תמונה 2 מתוך 2");
    expect(html).toContain("grid h-28");
    expect(html).toContain("rounded-[7px_18px_7px_18px]");
  });
});
