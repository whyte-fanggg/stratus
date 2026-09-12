export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const baseUrl = process.env.STRATUS_API_URL;
  if (!baseUrl) {
    return Response.json(
      { connector: "unavailable", profiles: [], reason: "Local AWS discovery is not configured for this runtime." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const incoming = new URL(request.url);
    const upstream = new URL("/v1/aws/inventory", baseUrl);
    if (incoming.searchParams.get("refresh") === "1") upstream.searchParams.set("refresh", "1");
    const client = incoming.searchParams.get("client");
    if (client) upstream.searchParams.set("client", client);
    const response = await fetch(upstream, { cache: "no-store", signal: AbortSignal.timeout(90_000) });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { connector: "unreachable", profiles: [], reason: "The local AWS discovery service could not be reached." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
