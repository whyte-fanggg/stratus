import { clients } from "../../../stratus-data";
import { buildPortfolioOverview, type BillingByClient, type PortfolioInventory } from "../../../../services/portfolio/overview";
import { mergeUploadedBilling, type UploadedBillingRecord } from "../../../../services/billing/merge";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const baseUrl = process.env.STRATUS_API_URL;
  let billing: BillingByClient = {
    Nilkamal: clients.Nilkamal.bills,
    GCPL: clients.GCPL.bills,
    Swastiks: clients.Swastiks.bills,
    Fusion: clients.Fusion.bills,
  };
  if (!baseUrl) return Response.json(buildPortfolioOverview(billing, []), { headers: { "Cache-Control": "no-store" } });
  try {
    const incoming = new URL(request.url);
    const upstream = new URL("/v1/aws/inventory", baseUrl);
    if (incoming.searchParams.get("refresh") === "1") upstream.searchParams.set("refresh", "1");
    else upstream.searchParams.set("cached", "1");
    const [response, billingResponse] = await Promise.all([
      fetch(upstream, { cache: "no-store", signal: AbortSignal.timeout(90_000) }),
      fetch(new URL("/v1/billing", baseUrl), { cache: "no-store", signal: AbortSignal.timeout(15_000) }),
    ]);
    const payload = await response.json() as { profiles?: PortfolioInventory[] };
    if (billingResponse.ok) {
      const billingPayload = await billingResponse.json() as { records?: UploadedBillingRecord[] };
      if (Array.isArray(billingPayload.records)) billing = mergeUploadedBilling(billingPayload.records);
    }
    const profiles = response.ok && Array.isArray(payload.profiles) ? payload.profiles : [];
    return Response.json(buildPortfolioOverview(billing, profiles), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(buildPortfolioOverview(billing, []), { headers: { "Cache-Control": "no-store" } });
  }
}
