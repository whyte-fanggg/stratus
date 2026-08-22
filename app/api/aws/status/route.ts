export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const baseUrl = process.env.STRATUS_API_URL;
  if (!baseUrl) {
    return Response.json(
      { connector: "unavailable", allConnected: false, profiles: [], reason: "Local AWS connector is not configured for this runtime." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const incoming = new URL(request.url);
    const upstream = new URL("/v1/aws/profiles", baseUrl);
    if (incoming.searchParams.get("refresh") === "1") upstream.searchParams.set("refresh", "1");
    const response = await fetch(upstream, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { connector: "unreachable", allConnected: false, profiles: [], reason: "The local AWS connector could not be reached." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
