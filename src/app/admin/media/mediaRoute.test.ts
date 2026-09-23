import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

describe("admin media route placement", () => {
  it("hosts the media desk at /admin/media and links it from the admin home", async () => {
    const [page, desk, adminHome] = await Promise.all([
      source("src/app/admin/media/page.tsx"),
      source("src/app/admin/media/MediaDesk.tsx"),
      source("src/app/admin/page.tsx"),
    ]);

    expect(page).toContain('title: "תמונות ומיתוג"');
    expect(page).toContain("<MediaDesk");
    expect(desk).toContain("תמונות ומיתוג");
    expect(adminHome).toContain('href="/admin/media"');
  });

  it("keeps media management out of /admin/shop", async () => {
    const [page, desk, actions] = await Promise.all([
      source("src/app/admin/shop/page.tsx"),
      source("src/app/admin/shop/ShopDesk.tsx"),
      source("src/app/admin/shop/actions.ts"),
    ]);
    const shopSource = `${page}\n${desk}\n${actions}`;

    expect(shopSource).not.toContain("MediaDesk");
    expect(shopSource).not.toContain("ShopMediaSection");
    expect(shopSource).not.toContain("logoStorageKey");
    expect(shopSource).not.toContain("portfolioImage");
  });

  it("uses direct pan and keyboard controls without visible focal sliders", async () => {
    const desk = await source("src/app/admin/media/MediaDesk.tsx");

    expect(desk).toContain("onPointerMove");
    expect(desk).toContain("onKeyDown");
    expect(desk).toContain("onLostPointerCapture={endDrag}");
    expect(desk).toContain("tabIndex={0}");
    expect(desk).not.toContain('type="range"');
    expect(desk).not.toContain("התאמה מדויקת");
  });

  it("keeps focal save feedback beside the relevant image action", async () => {
    const desk = await source("src/app/admin/media/MediaDesk.tsx");
    const focalFeedback = '<Feedback feedback={feedback} scope={`focal:${image.id}`} />';

    expect(desk.split(focalFeedback)).toHaveLength(2);
    expect(desk.indexOf(focalFeedback)).toBeGreaterThan(desk.indexOf("שמירת מיקום"));
  });

  it("uses portable explicit params typing for the media route", async () => {
    const route = await source("src/app/media/[...key]/route.ts");

    expect(route).toContain("params: Promise<{ key: string[] }>");
    expect(route).not.toContain("RouteContext<");
  });
});
