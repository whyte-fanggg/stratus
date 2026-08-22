import { parseAwsBillText } from "../../../../services/billing/aws-bill-parser";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES + 1024 * 64) return Response.json({ error: "Upload exceeds 10 MB" }, { status: 413 });
  const form = await request.formData();
  const file = form.get("bill");
  if (!(file instanceof File)) return Response.json({ error: "A bill PDF is required" }, { status: 400 });
  if (file.type !== "application/pdf" || file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Only PDF bills up to 10 MB are accepted" }, { status: 415 });
  try {
    const bill = parseAwsBillText(await file.text());
    return Response.json({ bill, sourceRetained: false }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Bill parsing failed", sourceRetained: false }, { status: 422 });
  }
}
