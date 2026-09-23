import { getMediaStorage, isSafeMediaStorageKey } from "@/lib/media/storage";

export const runtime = "nodejs";

type MediaRouteContext = {
  params: Promise<{ key: string[] }>;
};

export async function GET(_request: Request, context: MediaRouteContext) {
  const { key: segments } = await context.params;
  const key = segments.join("/");
  if (!isSafeMediaStorageKey(key)) {
    return new Response(null, { status: 404 });
  }
  const object = await (await getMediaStorage()).read(key);
  if (!object) {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
