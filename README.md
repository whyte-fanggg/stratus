# Stratus

Stratus is a read-only multi-client AWS operations workspace for infrastructure, billing, backups, network, IAM visibility, alerts, reporting, and source-aware analysis.

The application recognizes exactly four clients: Nilkamal, GCPL, Swastiks, and Fusion. AWS discovery is constrained to Mumbai (`ap-south-1`) and Hyderabad (`ap-south-2`), with IAM handled as a global service.

## Current architecture

- React 19 and TypeScript using Vinext/Vite
- Tailwind CSS 4 plus a custom responsive design system
- Cloudflare Worker server runtime
- Cloudflare D1 with Drizzle schema and checked-in migrations
- Platform access controls for the private deployed Site
- A Dockerized, server-side AWS profile connector and optional AI analysis boundary

The private hosted frontend remains an OpenAI Sites project running as a Cloudflare Worker with D1. For machines that hold the named AWS profiles, Docker Compose adds a separate Express connector and mounts the host `.aws` directory read-only. Credentials never enter the image, browser bundle, API response, database, or source control.

## Source material loaded

- 24 AWS bill summaries: six months each for Nilkamal, GCPL, Swastiks, and Fusion
- Infrastructure baselines for GCPL, Swastiks, and Fusion
- No Nilkamal infrastructure document was present in the supplied archive
- The empty Simpolo folder was intentionally ignored

Historical bill grand totals and pre-tax values are kept as integer cents. Uploaded bill source files are never treated as a document library and the upload endpoint does not retain source bytes.

## Development setup

Prerequisites:

- Node.js 22.13 or newer
- AWS CLI v2 for live read-only discovery
- Named AWS profiles on the host machine
- Docker Desktop or Docker Engine with Compose

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Local URL: `http://localhost:3000`

The first page can be used without AWS credentials. Source-backed billing and infrastructure data remain available, and every unavailable live value is shown explicitly.

### Docker startup with local AWS profiles

Set `AWS_CONFIG_DIR` to the absolute host directory containing AWS `config`, `credentials`, and any SSO cache, then start the stack. Do not copy this directory into the repository.

```powershell
$env:AWS_CONFIG_DIR = "$env:USERPROFILE/.aws"
docker compose up --build
```

On Linux:

```bash
AWS_CONFIG_DIR="$HOME/.aws" docker compose up --build
```

The browser calls the same-origin `/api/aws/status` route. That route proxies to `stratus-api`, which uses the AWS SDK credential provider on the server. The connector returns only client/profile health, expected and observed account IDs, timestamps, and safe error codes.

## Environment variables

```text
NEXT_PUBLIC_SITE_URL=http://localhost:3000
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=
AWS_CONFIG_DIR=/home/your-user/.aws
AWS_PROFILE_NILKAMAL=nilkamal
AWS_PROFILE_GCPL=gcpl
AWS_PROFILE_SWASTIKS=swastiks
AWS_PROFILE_FUSION=fusion
```

Never place AWS access keys, passwords, tokens, or AI API keys in source control. Stratus expects credentials to remain in the normal host AWS configuration files.

## AWS profile mapping

| Client | Named profile |
|---|---|
| Nilkamal | `nilkamal` |
| GCPL | `gcpl` |
| Swastiks | `swastiks` |
| Fusion | `fusion` |

The mapping and region list are centralized in `services/config.ts`.

### Read permissions

The AWS adapter is read-only. The final policy should permit the relevant `Describe*`, `Get*`, and `List*` calls for EC2, EBS, CloudWatch, S3, AWS Backup, VPC/network resources, IAM, Cost Explorer, and any significant services discovered in the account. CloudTrail event lookup requires `cloudtrail:LookupEvents`.

If a call is denied, store and display the exact AWS operation/error. Do not broaden permissions automatically and do not replace the failed result with sample data.

## Billing ingestion

The upload route accepts PDF files only, enforces a 10 MB limit, validates the supported AWS bill summary fields, represents money as integer cents, and returns `sourceRetained: false`. The data model prevents duplicate client/month entries.

Workflow:

```text
PDF upload -> type and size validation -> parse -> financial validation -> structured rows -> source discarded
```

The bundled parser expects the standard AWS bill-summary terminology used in the supplied files. Unsupported layouts return a clear `422` error.

## Synchronization

- Backups: every 24 hours
- General infrastructure: every 7 days
- Manual refresh: available at any time
- Operational history retention: approximately 30 days
- Billing history: at least six months and never deleted by a new upload

The UI verifies the selected named profile through the local connector and preserves previously stored data when a profile is absent, credentials expire, access is denied, throttling occurs, or a check fails. Resource-level discovery remains a separate read-only synchronization pass.

## Database

The Drizzle schema covers clients, AWS accounts, servers, EBS volumes, snapshots, S3 buckets, backups, VPCs, subnets, security groups, generic network resources, VPNs, IAM principals, service inventory, billing months, service costs, usage details, alerts, sync runs, and administrators.

```powershell
npm run db:generate
```

Checked-in SQL migrations under `drizzle/` are the source of truth for a fresh database. The Sites deployment control plane provisions and binds the real D1 database declared as `DB` in `.openai/hosting.json`.

## Authentication and security

The production Site should remain private through OpenAI Sites access controls. Authenticated user identity is provided by trusted platform headers; there are no shipped default credentials. All authorization decisions belong on the server.

Security controls include:

- no browser-side AWS credentials
- no secret persistence in D1
- upload type and size limits
- no uploaded-file retention
- prepared relational queries through D1/Drizzle
- CSP, frame denial, MIME sniffing protection, restrictive permissions policy, and referrer policy
- external AI key optional; the rest of Stratus works without it
- read-only AI and AWS interfaces

## Quality commands

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm test
```

Unit tests cover billing arithmetic and parsing, client/region configuration, resource-role inference, backup freshness, and retention. The rendered integration test checks the production worker output, required clients, removal of Simpolo, and security headers.

## Deployment and portability

Development data, migrations, and application code travel with the repository. Secrets and AWS profiles remain machine-specific.

1. Clone or pull the repository on the next Windows or Linux machine.
2. Copy `.env.example` to a local ignored environment file and configure optional AI settings.
3. Configure the same four AWS named profiles on the host.
4. Install dependencies and run the quality commands.
5. Deploy through OpenAI Sites, which provisions the Worker and D1 bindings.

## Operational status and limitations

All four required named profiles were verified with AWS STS on August 22, 2026, and each returned the expected client account. Docker Desktop 4.87.0, Engine 29.7.2, and Compose 5.4.0 were also verified. The Dockerized connector now exposes that validation safely to Stratus.

Profile validation is not the same as a completed resource-inventory sync. Live EC2, Backup, VPC, IAM, S3, CloudWatch, and Cost Explorer records remain unavailable until their read-only discovery collectors are run and persisted. The hosted Sites runtime cannot read a workstation's local `.aws` directory; use the Docker stack on the profile-owning machine, or provide an approved private connector for hosted synchronization. Nilkamal also lacks a supplied infrastructure baseline, so its initial stored view contains billing history only.
