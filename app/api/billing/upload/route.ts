import { mergeUploadedBilling, type UploadedBillingRecord } from "../../../../services/billing/merge";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function readUpstreamRecords(baseUrl: string): Promise<UploadedBillingRecord[]> {
  const response = await fetch(new URL("/v1/billing", baseUrl), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { records?: UploadedBillingRecord[]; error?: string };
  if (!response.ok || !Array.isArray(payload.records)) throw new Error(payload.error ?? "Billing storage is unavailable.");
  return payload.records;
}

export async function GET() {
  const baseUrl = process.env.STRATUS_API_URL;
  if (!baseUrl) return Response.json({ error: "Local billing storage is not configured for this runtime." }, { status: 503 });
  try {
    const records = await readUpstreamRecords(baseUrl);
    return Response.json({ billing: mergeUploadedBilling(records), records }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Billing storage is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 1024 * 64) return Response.json({ error: "Upload exceeds 10 MB" }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "The upload request is not valid multipart form data." }, { status: 400 });
  }
  const file = form.get("bill");
  if (!(file instanceof File)) return Response.json({ error: "A bill PDF is required" }, { status: 400 });
  if (file.type !== "application/pdf" || file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Only PDF bills up to 10 MB are accepted" }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5 || new TextDecoder("ascii").decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return Response.json({ error: "The uploaded file is not a valid PDF." }, { status: 415 });
  }
  const baseUrl = process.env.STRATUS_API_URL;
  if (!baseUrl) return Response.json({ error: "Local billing storage is not configured for this runtime." }, { status: 503 });
  try {
    const upstream = await fetch(new URL("/v1/billing/upload", baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Stratus-File-Name": encodeURIComponent(file.name),
      },
      body: bytes,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await upstream.json() as { bill?: UploadedBillingRecord; error?: string; replaced?: boolean; pagesParsed?: number; sourceRetained?: boolean };
    if (!upstream.ok || !payload.bill) {
      return Response.json({ error: payload.error ?? "Bill parsing failed.", sourceRetained: false }, { status: upstream.status });
    }
    const records = await readUpstreamRecords(baseUrl);
    return Response.json({ ...payload, billing: mergeUploadedBilling(records) }, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Bill parsing failed.", sourceRetained: false }, { status: 503 });
  }
}
