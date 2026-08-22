import express from "express";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromIni } from "@aws-sdk/credential-providers";

type ClientProfile = {
  client: string;
  profile: string;
  expectedAccountId: string;
};

type ProfileCheck = ClientProfile & {
  connected: boolean;
  accountId: string | null;
  accountMatches: boolean;
  checkedAt: string;
  errorCode: string | null;
};

const clientProfiles: ClientProfile[] = [
  { client: "Nilkamal", profile: process.env.AWS_PROFILE_NILKAMAL ?? "nilkamal", expectedAccountId: "254552067866" },
  { client: "GCPL", profile: process.env.AWS_PROFILE_GCPL ?? "gcpl", expectedAccountId: "768405430897" },
  { client: "Swastiks", profile: process.env.AWS_PROFILE_SWASTIKS ?? "swastiks", expectedAccountId: "181333805300" },
  { client: "Fusion", profile: process.env.AWS_PROFILE_FUSION ?? "fusion", expectedAccountId: "331174144767" },
];

const port = Number(process.env.PORT ?? 4000);
const region = process.env.AWS_REGION ?? "ap-south-1";
const cacheTtlMs = 30_000;
let cached: { expiresAt: number; profiles: ProfileCheck[] } | null = null;

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error && "name" in error && typeof error.name === "string") return error.name;
  return "AwsProfileCheckFailed";
}

async function checkProfile(definition: ClientProfile): Promise<ProfileCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const client = new STSClient({
      region,
      credentials: fromIni({ profile: definition.profile }),
    });
    const identity = await client.send(new GetCallerIdentityCommand({}));
    const accountId = identity.Account ?? null;
    return {
      ...definition,
      connected: Boolean(accountId) && accountId === definition.expectedAccountId,
      accountId,
      accountMatches: accountId === definition.expectedAccountId,
      checkedAt,
      errorCode: null,
    };
  } catch (error) {
    return {
      ...definition,
      connected: false,
      accountId: null,
      accountMatches: false,
      checkedAt,
      errorCode: safeErrorCode(error),
    };
  }
}

async function getProfileChecks(force = false): Promise<ProfileCheck[]> {
  if (!force && cached && cached.expiresAt > Date.now()) return cached.profiles;
  const profiles = await Promise.all(clientProfiles.map(checkProfile));
  cached = { expiresAt: Date.now() + cacheTtlMs, profiles };
  return profiles;
}

const app = express();
app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "stratus-api" });
});

app.get("/v1/aws/profiles", async (request, response) => {
  const profiles = await getProfileChecks(request.query.refresh === "1");
  const connected = profiles.filter((profile) => profile.connected).length;
  response.setHeader("Cache-Control", "no-store");
  response.status(connected === profiles.length ? 200 : 503).json({
    connector: "local-aws-profile",
    readOnly: true,
    connected,
    expected: profiles.length,
    allConnected: connected === profiles.length,
    profiles,
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Stratus read-only AWS connector listening on port ${port}`);
});
