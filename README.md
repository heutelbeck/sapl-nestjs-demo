# @sapl/nestjs Demo

Demo application for [`@sapl/nestjs`](https://github.com/heutelbeck/sapl-nestjs) showing every feature of the library: basic authorization, content filtering, all seven constraint handler interfaces, resource replacement, advice vs obligations, service-level enforcement, and streaming SSE with continuous authorization. All endpoints work with plain `curl` except the export endpoints, which require a JWT from Keycloak. The source files have comprehensive JSDoc -- read the code for the full story.

## Architecture

![Architecture](https://raw.githubusercontent.com/heutelbeck/sapl-nestjs-demo/main/docs/architecture.svg)

## Quick Start

```bash
docker compose up -d
npm install && npm run start:dev
```

Swagger UI: http://localhost:3000/api-docs

## Endpoints

### Basic Authorization

```bash
curl -s http://localhost:3000/api/hello | jq
```

### Content Filtering

```bash
# SSN blackened (last 4 visible)
curl -s http://localhost:3000/api/constraints/patient | jq

# Blacken + delete + replace combined
curl -s http://localhost:3000/api/constraints/patient-full | jq
```

### Constraint Handlers

```bash
# RunnableConstraintHandlerProvider -- logs to server console
curl -s http://localhost:3000/api/constraints/logged | jq

# ConsumerConstraintHandlerProvider -- records to audit trail
curl -s http://localhost:3000/api/constraints/audited | jq
curl -s http://localhost:3000/api/constraints/audit-log | jq

# MappingConstraintHandlerProvider -- redacts fields
curl -s http://localhost:3000/api/constraints/redacted | jq

# FilterPredicateConstraintHandlerProvider -- filters array by classification
curl -s http://localhost:3000/api/constraints/documents | jq

# MethodInvocationConstraintHandlerProvider -- injects timestamp into request
curl -s http://localhost:3000/api/constraints/timestamped | jq

# ErrorHandlerProvider + ErrorMappingConstraintHandlerProvider -- error pipeline
curl -s http://localhost:3000/api/constraints/error-demo | jq
```

### Advanced Patterns

```bash
# PDP replaces the controller's return value entirely
curl -s http://localhost:3000/api/constraints/resource-replaced | jq

# Advice (best-effort) -- unhandled advice does NOT deny access
curl -s http://localhost:3000/api/constraints/advised | jq

# @PostEnforce with ctx.returnValue -- policy sees the actual return data
curl -s http://localhost:3000/api/constraints/record/42 | jq

# Unhandled obligation -- fail-fast (403 despite PERMIT)
curl -s http://localhost:3000/api/constraints/unhandled | jq

# @PostEnforce with onDeny callback -- structured deny response
curl -s http://localhost:3000/api/constraints/audit | jq
```

### Service-Level Enforcement

```bash
# Basic service-level @PreEnforce
curl -s http://localhost:3000/api/services/patients | jq

# Find patient by name (logAccess obligation)
curl -s 'http://localhost:3000/api/services/patients/find?name=Jane' | jq

# @PostEnforce on service -- SSN blackened
curl -s http://localhost:3000/api/services/patients/P-001 | jq

# Mapping handler on service return -- redacts ssn + insurance
curl -s http://localhost:3000/api/services/patients/P-001/summary | jq

# Combined: log + filter by classification
curl -s 'http://localhost:3000/api/services/patients/search?q=healthy' | jq

# Argument manipulation -- amount capped at 5000 by policy
curl -s -X POST 'http://localhost:3000/api/services/transfer?amount=10000' | jq
curl -s -X POST 'http://localhost:3000/api/services/transfer?amount=3000' | jq
```

### Streaming Authorization (SSE)

The policy cycles PERMIT/DENY based on the current second: 0-19 permit, 20-39 deny, 40-59 permit.

```bash
# Terminates permanently on first DENY
curl -N http://localhost:3000/api/streaming/heartbeat/till-denied

# Silently drops events during DENY, resumes on PERMIT
curl -N http://localhost:3000/api/streaming/heartbeat/drop-while-denied

# Sends ACCESS_SUSPENDED / ACCESS_RESTORED signals on transitions
curl -N http://localhost:3000/api/streaming/heartbeat/recoverable

# Callback-driven termination: sends GOODBYE event then terminates
curl -N http://localhost:3000/api/streaming/heartbeat/terminated-by-callback

# Drop-while-denied with in-band suspend/restore signals
curl -N http://localhost:3000/api/streaming/heartbeat/drop-with-callbacks
```

### Export Data (JWT Required)

The only endpoints requiring authentication. The policy uses `<jwt.token>` to extract claims from the Bearer token and matches the clinician's `pilotId` against the requested `pilotId`. This demonstrates real ABAC where the PDP inspects identity attributes.

**How JWT flows through the system:** NestJS validates the JWT via Passport/JWKS. The `@PreEnforce` decorator passes the raw token to the PDP via the `secrets` callback. The SAPL policy reads `<jwt.token>.payload.pilotId` to make the authorization decision.

**Keycloak** starts automatically with `docker compose up -d` on port 8080 (admin/admin). The `demo` realm has pre-configured test users:

| Username     | Password | Role        | Pilot ID |
|--------------|----------|-------------|----------|
| clinician1   | password | CLINICIAN   | 1        |
| clinician2   | password | CLINICIAN   | 2        |
| participant1 | password | PARTICIPANT | 1        |
| participant2 | password | PARTICIPANT | 2        |

```bash
# Get a token
TOKEN=$(curl -s -X POST 'http://localhost:8080/realms/demo/protocol/openid-connect/token' -H 'Content-Type: application/x-www-form-urlencoded' -d 'grant_type=password' -d 'client_id=nestjs-app' -d 'client_secret=dev-secret' -d 'username=clinician1' -d 'password=password' | jq -r '.access_token')

# Permitted: clinician1 (pilotId=1) accessing pilot 1 data
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData/1/1 | jq

# Denied: clinician1 (pilotId=1) accessing pilot 2 data
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData/2/1 | jq

# Custom onDeny handler -- structured JSON deny response instead of 403
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData2/2/1 | jq
```

## Reference

### Endpoint Reference

| Path | Decorator | Auth | Description |
|------|-----------|------|-------------|
| GET /api/hello | Manual | None | `PdpService.decideOnce()` |
| GET /api/exportData/:p/:s | `@PreEnforce` | JWT | Custom resource builder, ABAC |
| GET /api/exportData2/:p/:s | `@PreEnforce` | JWT | Custom onDeny handler |
| GET /api/constraints/patient | `@PreEnforce` | None | Blacken SSN |
| GET /api/constraints/patient-full | `@PreEnforce` | None | Blacken + delete + replace |
| GET /api/constraints/logged | `@PreEnforce` | None | RunnableConstraintHandlerProvider |
| GET /api/constraints/audited | `@PreEnforce` | None | ConsumerConstraintHandlerProvider |
| GET /api/constraints/audit-log | None | None | View audit trail (auxiliary) |
| GET /api/constraints/redacted | `@PreEnforce` | None | MappingConstraintHandlerProvider |
| GET /api/constraints/documents | `@PreEnforce` | None | FilterPredicateConstraintHandlerProvider |
| GET /api/constraints/timestamped | `@PreEnforce` | None | MethodInvocationConstraintHandlerProvider |
| GET /api/constraints/error-demo | `@PreEnforce` | None | ErrorHandler + ErrorMapping |
| GET /api/constraints/resource-replaced | `@PreEnforce` | None | PDP resource replacement |
| GET /api/constraints/advised | `@PreEnforce` | None | Advice (best-effort) |
| GET /api/constraints/record/:id | `@PostEnforce` | None | ctx.returnValue |
| GET /api/constraints/unhandled | `@PreEnforce` | None | Unhandled obligation (fail-fast) |
| GET /api/constraints/audit | `@PostEnforce` | None | onDeny callback |
| GET /api/services/patients | `@PreEnforce` | None | Service-level basic enforcement |
| GET /api/services/patients/find | `@PreEnforce` | None | Find patient (logAccess) |
| GET /api/services/patients/search | `@PreEnforce` | None | Combined: log + filter |
| GET /api/services/patients/:id | `@PostEnforce` | None | @PostEnforce on service |
| GET /api/services/patients/:id/summary | `@PreEnforce` | None | Mapping handler on service |
| POST /api/services/transfer | `@PreEnforce` | None | Argument manipulation |
| SSE /api/streaming/heartbeat/till-denied | `@EnforceTillDenied` | None | Terminal denial |
| SSE /api/streaming/heartbeat/drop-while-denied | `@EnforceDropWhileDenied` | None | Silent drops during DENY |
| SSE /api/streaming/heartbeat/recoverable | `@EnforceRecoverableIfDenied` | None | In-band deny/recover signals |
| SSE /api/streaming/heartbeat/terminated-by-callback | `@EnforceRecoverableIfDenied` | None | Callback-driven termination |
| SSE /api/streaming/heartbeat/drop-with-callbacks | `@EnforceDropWhileDenied` | None | Drop with in-band signals |

### Constraint Handler Reference

| Interface | Signature | When It Runs | Demo Handler |
|-----------|-----------|--------------|--------------|
| `RunnableConstraintHandlerProvider` | `() => void` | On decision, before method | `LogAccessHandler` |
| `ConsumerConstraintHandlerProvider` | `(value) => void` | After method, side-effect on response | `AuditTrailHandler` |
| `MappingConstraintHandlerProvider` | `(value) => any` | After method, transforms response | `RedactFieldsHandler` |
| `FilterPredicateConstraintHandlerProvider` | `(element) => boolean` | After method, filters arrays | `ClassificationFilterHandler` |
| `MethodInvocationConstraintHandlerProvider` | `(ctx: MethodInvocationContext) => void` | Before method, modifies request/args | `InjectTimestampHandler`, `CapTransferHandler` |
| `ErrorHandlerProvider` | `(error) => void` | On error, side-effect | `NotifyOnErrorHandler` |
| `ErrorMappingConstraintHandlerProvider` | `(error) => Error` | On error, transforms error | `EnrichErrorHandler` |

### Policy Reference

| Policy | Effect | Description |
|--------|--------|-------------|
| permit-read-hello | PERMIT | Any request, action "read", resource "hello" |
| permit-clinician-export | PERMIT | Clinician pilotId match, time-gated (JWT) |
| permit-read-patient | PERMIT + obligation | Blackens SSN via filterJsonContent |
| permit-patient-full | PERMIT + obligation | Blacken + delete + replace combined |
| permit-logged | PERMIT + obligation | logAccess (Runnable) |
| permit-audited | PERMIT + obligation | auditTrail (Consumer) |
| permit-redacted | PERMIT + obligation | redactFields (Mapping) |
| permit-documents | PERMIT + obligation | filterByClassification (FilterPredicate) |
| permit-timestamped | PERMIT + obligation | injectTimestamp (MethodInvocation) |
| permit-error-handling | PERMIT + obligation | notifyOnError + enrichError (error pipeline) |
| permit-replaced | PERMIT + transform | PDP replaces the resource entirely |
| permit-advised | PERMIT + advice | logAccess + unhandled advice (best-effort) |
| permit-read-record | PERMIT | Reads records (@PostEnforce) |
| permit-read-audit | PERMIT | Reads audit logs (@PostEnforce) |
| permit-read-secret | PERMIT + obligation | Unknown obligation type (fail-fast) |
| permit-service-list-patients | PERMIT | Lists patients (service-level) |
| permit-service-find-patient | PERMIT + obligation | logAccess on service method |
| permit-service-patient-detail | PERMIT + obligation | Blackens SSN (@PostEnforce) |
| permit-service-patient-summary | PERMIT + obligation | redactFields on ssn + insurance |
| permit-service-search-patients | PERMIT + obligation | logAccess + filterByClassification |
| permit-service-transfer | PERMIT + obligation | capTransferAmount + logAccess |
| streaming-heartbeat-time-based | PERMIT + obligation | Time-based cycling + logAccess |

## Stopping

```bash
docker compose down
```

## License

Apache-2.0
