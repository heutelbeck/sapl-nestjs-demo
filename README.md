# sapl-nestjs-demo

Demo application for [`@sapl/nestjs`](https://github.com/heutelbeck/sapl-nestjs) -- Attribute-Based Access Control (ABAC) with SAPL in NestJS.

## Prerequisites

- Node.js >= 20
- Docker and Docker Compose

## Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **Keycloak** on `http://localhost:8080` (admin/admin) with a `demo` realm
- **SAPL PDP** (sapl-node) on `http://localhost:8443` in noauth mode

### 2. Start the application

```bash
npm install
npm run start:dev
```

The app starts on `http://localhost:3000`. Swagger UI is at `http://localhost:3000/api-docs`.

### 3. Get an access token

```bash
TOKEN=$(curl -s -X POST 'http://localhost:8080/realms/demo/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password' \
  -d 'client_id=nestjs-app' \
  -d 'client_secret=dev-secret' \
  -d 'username=clinician1' \
  -d 'password=password' | jq -r '.access_token')
```

### 4. Call endpoints

```bash
# Manual PDP access -- permitted for all authenticated users
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/hello | jq

# @PreEnforce -- clinician1 can export pilot 1 data (own pilotId)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData/1/seq1 | jq

# @PreEnforce -- clinician1 cannot export pilot 2 data (different pilotId)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData/2/seq1 | jq

# @PreEnforce with onDeny -- returns structured error instead of 403
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData2/2/seq1 | jq

# Constraint handling -- SSN is blackened by obligation
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/patient | jq

# @PostEnforce -- handler runs, PDP sees return value
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/record/42 | jq

# Unhandled obligation -- PERMIT with unknown constraint type => 403
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/unhandled | jq

# @PostEnforce with onDeny -- participant gets custom deny response
PARTICIPANT_TOKEN=$(curl -s -X POST 'http://localhost:8080/realms/demo/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password' \
  -d 'client_id=nestjs-app' \
  -d 'client_secret=dev-secret' \
  -d 'username=participant1' \
  -d 'password=password' | jq -r '.access_token')
curl -s -H "Authorization: Bearer $PARTICIPANT_TOKEN" http://localhost:3000/api/constraints/audit | jq
```

## Demo Users

| Username       | Password   | Role        | Pilot ID |
|---------------|------------|-------------|----------|
| clinician1    | password   | CLINICIAN   | 1        |
| clinician2    | password   | CLINICIAN   | 2        |
| participant1  | password   | PARTICIPANT | 1        |
| participant2  | password   | PARTICIPANT | 2        |

## SAPL Policies

Policies are in the `policies/` directory and loaded by the sapl-node PDP:

| Policy | Effect | Condition |
|--------|--------|-----------|
| permit-read-hello | PERMIT | Any user, action "read", resource "hello" |
| permit-clinician-export | PERMIT | Clinician whose pilotId matches resource.pilotId |
| permit-clinician-read-patient | PERMIT + obligation | Clinician; blackens SSN field |
| permit-clinician-read-record | PERMIT | Clinician |
| permit-clinician-read-audit | PERMIT | Clinician |
| permit-read-secret | PERMIT + obligation | Any user; unknown obligation type (fail-fast demo) |
| deny-default | DENY | Catch-all fallback |

## Endpoints

| Method | Path | Decorator | What It Demonstrates |
|--------|------|-----------|---------------------|
| GET | /api/hello | Manual PDP | `PdpService.decideOnce()` without decorators |
| GET | /api/exportData/:pilotId/:sequenceId | `@PreEnforce` | Custom resource builder, pilotId matching |
| GET | /api/exportData2/:pilotId/:sequenceId | `@PreEnforce` | Custom `onDeny` handler |
| GET | /api/constraints/patient | `@PreEnforce` | Obligation: `filterJsonContent` blackens SSN |
| GET | /api/constraints/record/:id | `@PostEnforce` | `ctx.returnValue` in subscription callback |
| GET | /api/constraints/unhandled | `@PreEnforce` | Unhandled obligation causes 403 |
| GET | /api/constraints/audit | `@PostEnforce` | `onDeny` callback returns custom response |

## Stopping

```bash
docker compose down
```

## License

Apache-2.0
