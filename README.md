# Stratus

Stratus is a local, read-only multi-client AWS operations workspace for infrastructure, billing, S3 backups, networking, IAM visibility, alerts, reporting, static price estimation, and source-aware AI analysis.

It recognizes exactly four AWS accounts: Nilkamal, GCPL, Swastiks, and Fusion. Live regional discovery is limited to Mumbai (`ap-south-1`) and Hyderabad (`ap-south-2`); IAM is global. Simpolo and Skubiq are intentionally excluded.

## Runtime architecture

- Vinext, React 19, TypeScript, and a responsive custom design system
- A Dockerized Express connector using the AWS SDK and the host's named profiles
- Atomic JSON persistence in the `stratus-billing-data` Docker volume for normalized bills and the latest AWS inventory snapshot
- Server-only OpenAI Responses API integration when `OPENAI_API_KEY` is configured
- A centralized static AWS pricing snapshot; the calculator makes no AWS Pricing API calls

The current production-like local path is Docker Compose. The checked-in Drizzle/D1 schema is not connected to this local runtime, and the previously configured Sites project is no longer available. Do not treat D1 as the active database.

## Data sources and behavior

- Bundled history: 24 supplied AWS bill summaries, six months each for the four managed clients
- Uploaded bills: PDF only, 10 MB maximum, parsed and financially validated; source bytes are discarded
- Infrastructure: EC2 instances and attached EBS volumes from both configured regions
- Network: VPCs, subnets, site-to-site VPNs and tunnel telemetry, Elastic IPs, internet/NAT gateways, and security groups
- IAM: users, groups, attached/inline/group policies, MFA, console-access evidence, and access-key status/age; secret values are never read
- Backups: object metadata from the explicitly configured S3 backup prefixes only, using paginated `ListObjectsV2`; files are never downloaded
- AWS Backup: deliberately unsupported because Stratus uses S3-stored backups

The general S3 inventory reads bucket metadata only. It does not traverse unrelated prefixes. Exact backup scopes are centralized in `services/config.ts` and exclude every Skubiq location.

## Local setup

Prerequisites: Docker Desktop or Docker Engine with Compose, and the four named AWS profiles on the host.

```powershell
Copy-Item .env.example .env
$env:AWS_CONFIG_DIR = "$env:USERPROFILE/.aws"
docker compose up -d --build
```

Open `http://localhost:3000`. The port binds to loopback only because this build does not include application authentication.

The default profile mapping is:

| Client | Profile |
|---|---|
| Nilkamal | `nilkamal` |
| GCPL | `gcpl` |
| Swastiks | `swastiks` |
| Fusion | `fusion` |

Override profile names with `AWS_PROFILE_NILKAMAL`, `AWS_PROFILE_GCPL`, `AWS_PROFILE_SWASTIKS`, and `AWS_PROFILE_FUSION`. AWS credentials stay in the mounted host AWS directory and are never copied into an image or returned to the browser.

## OpenAI configuration

Put the key in the ignored repository-root `.env` file:

```text
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-5.4-mini
```

Never use a `NEXT_PUBLIC_` prefix. Rebuild the web container after a change:

```powershell
docker compose up -d --build stratus-web
```

AI calls are server-side, use `store: false`, and receive a bounded snapshot of persisted billing and live inventory. Without a key, the rest of Stratus remains functional and the assistant reports that provider analysis is unavailable.

## Billing ingestion

```text
PDF upload -> type/size checks -> text extraction -> field and arithmetic validation -> atomic normalized record -> source discarded
```

Re-uploading the same client and billing period replaces that record. The store keeps a six-month window per client. Money is parsed and aggregated with integer cents.

## Synchronization

- General AWS inventory: every 7 days
- S3 backup metadata: every 24 hours
- Scheduler check: every 15 minutes
- Manual selected-client refresh: client dashboard ribbon
- Manual all-client refresh: header button

The connector serves the persisted snapshot immediately after restart, runs one catch-up refresh if a cadence was missed, and coalesces concurrent refresh requests. Successful services replace their current snapshot; failed services retain prior data and return explicit source errors.

## Security boundary

- Browser traffic is same-origin and the connector is not published to the host
- Web port is `127.0.0.1:3000` only
- AWS and OpenAI credentials remain server-side
- AWS operations are read-only metadata discovery
- PDF type/size/layout validation and no source retention
- CSP, frame denial, MIME-sniffing protection, restrictive permissions policy, and referrer policy

There is no login/logout implementation in this repository. Before exposing Stratus beyond localhost, add an approved identity provider or authenticated reverse proxy and choose a production database/persistence design.

## Quality commands

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm test
node tests/browser-smoke.mjs
```

Connector typecheck:

```powershell
cd services/api
pnpm run typecheck
```

The unit suite covers billing arithmetic/parsing, client and region scope, resource-role inference, IAM administrator evidence, S3 backup freshness, retention, static pricing coverage/calculations, gp3 baseline charging, portfolio reconciliation, and cross-period billing protection.

## Known boundaries

- CloudWatch operational metrics and Cost Explorer are not collected because current pages do not display them; the pricing drawer contains static estimator rates only.
- Bill PDFs preserve only the normalized summary fields shown in billing; they are not retained as a document library.
- Nilkamal has no supplied offline infrastructure document, so its non-live fallback is billing-only.
- The application does not invent unavailable live values or backup records.
