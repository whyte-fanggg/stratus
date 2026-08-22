export function parseIamPolicyDocument(document: string | undefined): unknown {
  if (!document) return null;
  try { return JSON.parse(decodeURIComponent(document)); } catch { return null; }
}

function includesWildcard(value: unknown): boolean {
  return value === "*" || (Array.isArray(value) && value.includes("*"));
}

export function allowsAdministrator(document: unknown): boolean {
  if (!document || typeof document !== "object" || !("Statement" in document)) return false;
  const statements = Array.isArray(document.Statement) ? document.Statement : [document.Statement];
  return statements.some((statement) => {
    if (!statement || typeof statement !== "object") return false;
    return "Effect" in statement && statement.Effect === "Allow" && "Action" in statement && includesWildcard(statement.Action) && "Resource" in statement && includesWildcard(statement.Resource);
  });
}
