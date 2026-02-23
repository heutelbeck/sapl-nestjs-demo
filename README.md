# sapl-nestjs-demo

Demo application for [`@sapl/nestjs`](https://github.com/heutelbeck/sapl-nestjs) -- Attribute-Based Access Control (ABAC) with SAPL in NestJS.

This demo systematically demonstrates every feature of the `@sapl/nestjs` library:
basic authorization patterns, built-in content filtering, all seven custom constraint
handler interfaces, resource replacement, advice vs obligations, and fail-fast behavior.

## Prerequisites

- Node.js >= 20
- Docker and Docker Compose
- `jq` (for formatting JSON output)

## Quick Start

### 1. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- **Keycloak** on `http://localhost:8080` (admin/admin) with a `demo` realm and pre-configured users
- **SAPL PDP** (sapl-node) on `http://localhost:8443` in noauth mode with policies from `policies/`

### 2. Start the Application

```bash
npm install
npm run start:dev
```

The app starts on `http://localhost:3000`. Swagger UI is at `http://localhost:3000/api-docs`.

### 3. Get Access Tokens

```bash
# Clinician token (role: CLINICIAN, pilotId: 1)
TOKEN=$(curl -s -X POST 'http://localhost:8080/realms/demo/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password' -d 'client_id=nestjs-app' -d 'client_secret=dev-secret' \
  -d 'username=clinician1' -d 'password=password' | jq -r '.access_token')

# Participant token (role: PARTICIPANT, pilotId: 1) -- used for deny demos
PARTICIPANT_TOKEN=$(curl -s -X POST 'http://localhost:8080/realms/demo/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=password' -d 'client_id=nestjs-app' -d 'client_secret=dev-secret' \
  -d 'username=participant1' -d 'password=password' | jq -r '.access_token')
```

## Demo Users

| Username    | Password | Role        | Pilot ID |
|-------------|----------|-------------|----------|
| clinician1  | password | CLINICIAN   | 1        |
| clinician2  | password | CLINICIAN   | 2        |
| participant1| password | PARTICIPANT | 1        |
| participant2| password | PARTICIPANT | 2        |

---

## Demo Scenarios

The demo is organized into three sections, progressing from basic to advanced.
Each scenario includes the curl command, expected output, and an explanation of
what happens behind the scenes.

### Section 1: Basic Authorization

These endpoints demonstrate the three fundamental ways to enforce SAPL policies.

**Source:** `src/app.controller.ts`

#### 1.1 Manual PDP Access

Calls `PdpService.decideOnce()` directly. The application code builds the
subscription, sends it to the PDP, and interprets the decision manually.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/hello | jq
```

Expected: `{ "message": "hello" }`

#### 1.2 @PreEnforce -- Attribute-Based Access Control

The `@PreEnforce` decorator automates the entire PDP flow. The `resource` callback
builds a custom subscription from route parameters. The policy matches the clinician's
`pilotId` claim against the requested `pilotId`.

```bash
# Permitted: clinician1 (pilotId=1) accessing pilot 1 data
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData/1/1 | jq

# Denied: clinician1 (pilotId=1) accessing pilot 2 data
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData/2/1 | jq
```

Expected: First returns export data, second returns 403.

#### 1.3 @PreEnforce with Custom onDeny Handler

Instead of throwing ForbiddenException (HTTP 403), the `onDeny` callback returns
a structured JSON response with the decision details.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/exportData2/2/1 | jq
```

Expected: `{ "error": "access_denied", "decision": "DENY", "user": "clinician1", ... }`

---

### Section 2: Built-in Content Filtering

The `@sapl/nestjs` library includes a built-in `ContentFilteringProvider` that handles
`filterJsonContent` obligations. It supports three actions: **blacken** (mask characters),
**delete** (remove fields), and **replace** (substitute values).

**Source:** `src/constraint-demo.controller.ts` (Section 1)

#### 2.1 Blacken Fields

The policy attaches an obligation to mask the SSN field, disclosing only the last 4 characters.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/patient | jq
```

Expected: `{ "name": "Jane Doe", "ssn": "███████6789", "email": "jane.doe@example.com", ... }`

Policy obligation:
```json
{ "type": "filterJsonContent", "actions": [{ "type": "blacken", "path": "$.ssn", "discloseRight": 4 }] }
```

#### 2.2 All Three Actions Combined (blacken + delete + replace)

A single obligation combines all three content filter actions on one response object.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/patient-full | jq
```

Expected:
- `ssn`: masked (blacken, last 4 visible)
- `internalNotes`: absent (deleted)
- `email`: `"redacted@example.com"` (replaced)
- `name`, `diagnosis`: unchanged

Policy obligation:
```json
{
  "type": "filterJsonContent",
  "actions": [
    { "type": "blacken", "path": "$.ssn", "discloseRight": 4 },
    { "type": "delete", "path": "$.internalNotes" },
    { "type": "replace", "path": "$.email", "replacement": "redacted@example.com" }
  ]
}
```

---

### Section 3: Custom Constraint Handlers

`@sapl/nestjs` defines seven constraint handler provider interfaces. Each handles a
different aspect of policy enforcement. This section demonstrates all seven with
custom handler implementations.

**Handlers:** `src/handlers/`
**Endpoints:** `src/constraint-demo.controller.ts` (Section 2)

#### 3.1 RunnableConstraintHandlerProvider -- Logging Obligation

**Handler:** `LogAccessHandler` (`src/handlers/log-access.handler.ts`)
**Interface:** `RunnableConstraintHandlerProvider` -- `getHandler()` returns `() => void`

Runs a side-effect (logging) when a PDP decision is received, BEFORE the controller
method executes. The handler receives no input and returns nothing.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/logged | jq
```

Expected response: `{ "message": "This response was logged by a policy obligation", ... }`
Watch server console for: `[LogAccessHandler] [POLICY] Patient data accessed by clinician`

#### 3.2 ConsumerConstraintHandlerProvider -- Audit Trail

**Handler:** `AuditTrailHandler` (`src/handlers/audit-trail.handler.ts`)
**Interface:** `ConsumerConstraintHandlerProvider` -- `getHandler()` returns `(value: any) => void`

Receives the response value AFTER the controller returns and records it to an in-memory
audit log. The response itself is NOT modified (consumers are side-effect only).

```bash
# Step 1: Call the audited endpoint
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/audited | jq

# Step 2: View what was recorded
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/audit-log | jq
```

Expected audit log: `[{ "timestamp": "...", "action": "readMedicalRecord", "value": { ... } }]`

#### 3.3 MappingConstraintHandlerProvider -- Response Transformation

**Handler:** `RedactFieldsHandler` (`src/handlers/redact-fields.handler.ts`)
**Interface:** `MappingConstraintHandlerProvider` -- `getHandler()` returns `(value: any) => any`

Transforms the response by replacing specified fields with `"[REDACTED]"`. Unlike the
built-in ContentFilter, this is a custom domain-specific transformation. Mapping handlers
also support priority ordering via `getPriority()`.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/redacted | jq
```

Expected: `{ "name": "John Smith", "ssn": "[REDACTED]", "creditCard": "[REDACTED]", "email": "john@example.com", ... }`

#### 3.4 FilterPredicateConstraintHandlerProvider -- Collection Filtering

**Handler:** `ClassificationFilterHandler` (`src/handlers/classification-filter.handler.ts`)
**Interface:** `FilterPredicateConstraintHandlerProvider` -- `getHandler()` returns `(element: any) => boolean`

When the controller returns an array, this predicate filters elements. The policy
restricts the clinician to documents classified as INTERNAL or lower.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/documents | jq
```

Expected: Only PUBLIC and INTERNAL documents returned (CONFIDENTIAL and SECRET filtered out).

```json
[
  { "id": "DOC-1", "title": "Company Newsletter", "classification": "PUBLIC" },
  { "id": "DOC-2", "title": "Team Standup Notes", "classification": "INTERNAL" }
]
```

#### 3.5 MethodInvocationConstraintHandlerProvider -- Request Modification

**Handler:** `InjectTimestampHandler` (`src/handlers/inject-timestamp.handler.ts`)
**Interface:** `MethodInvocationConstraintHandlerProvider` -- `getHandler()` returns `(request: any) => void`

Modifies the Express request object BEFORE the controller method executes. The handler
adds a `policyTimestamp` property that the controller reads and includes in the response.

This pattern is useful for injecting policy-derived metadata, modifying request parameters,
or adding traceability data before method execution.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/timestamped | jq
```

Expected: `{ "message": "...", "policyTimestamp": "2026-02-22T...", "data": { ... } }`

#### 3.6 ErrorHandlerProvider + ErrorMappingConstraintHandlerProvider -- Error Pipeline

**Handlers:**
- `NotifyOnErrorHandler` (`src/handlers/notify-on-error.handler.ts`) -- `ErrorHandlerProvider`
- `EnrichErrorHandler` (`src/handlers/enrich-error.handler.ts`) -- `ErrorMappingConstraintHandlerProvider`

The controller intentionally throws to demonstrate the error pipeline. When a
policy-protected method throws:

1. `NotifyOnErrorHandler` runs a side-effect (logs the error) -- does NOT modify it
2. `EnrichErrorHandler` transforms the error, appending a support URL to the message

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/error-demo | jq
```

Expected: 500 Internal Server Error
Watch server console for:
- `[NotifyOnErrorHandler] [ERROR-NOTIFY] Error during policy-protected operation: Simulated backend failure`
- `[EnrichErrorHandler] [ERROR-ENRICH] Enriching error with support URL: https://support.example.com/errors`

---

### Section 4: Advanced Patterns

These endpoints demonstrate architectural patterns beyond simple constraint handling.

**Source:** `src/constraint-demo.controller.ts` (Section 3)

#### 4.1 Resource Replacement

The PDP can replace the controller's return value entirely using SAPL's `transform`
keyword. The `ConstraintHandlerBundle` substitutes the original response with the
PDP-provided resource.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/resource-replaced | jq
```

Expected: `{ "message": "This resource was replaced by the PDP", "policyGenerated": true, ... }`
The controller returns `{ "message": "You should NOT see this...", ... }` -- but the PDP replaces it.

#### 4.2 Advice vs Obligations

The PDP attaches two ADVICE constraints (not obligations):
- `logAccess` -- handled by `LogAccessHandler`
- `nonExistentAdviceHandler` -- no handler exists

Key difference: **obligations are mandatory** (unhandled = access denied),
**advice is best-effort** (unhandled = access still granted).

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/advised | jq
```

Expected: `{ "message": "Access granted despite unhandled advice", ... }`
Access is granted even though one advice handler is missing. Compare with 4.4 below.

#### 4.3 @PostEnforce with ctx.returnValue

In `@PostEnforce`, the controller executes FIRST, then the PDP is called. The return
value is available as `ctx.returnValue` in the resource callback, allowing policies
to make decisions based on the actual data being returned.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/record/42 | jq
```

Expected: `{ "id": "42", "value": "sensitive-data", "classification": "confidential" }`

#### 4.4 Unhandled Obligation -- Fail-Fast

The PDP returns PERMIT with an obligation of type `unknownConstraintType`. No registered
handler can process it. Because **obligations are mandatory**, the `ConstraintEnforcementService`
throws ForbiddenException -- the controller method never executes.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/unhandled | jq
```

Expected: 403 Forbidden -- despite the PDP decision being PERMIT.
Compare with 4.2 (Advice): unhandled advice does NOT deny access.

#### 4.5 @PostEnforce with onDeny Callback

The `onDeny` callback returns a structured JSON response instead of HTTP 403.
Clinicians are permitted; participants are denied with a custom response body.

```bash
# Clinician: permitted
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/constraints/audit | jq

# Participant: denied with custom response
curl -s -H "Authorization: Bearer $PARTICIPANT_TOKEN" http://localhost:3000/api/constraints/audit | jq
```

Expected (participant): `{ "denied": true, "reason": "DENY", "handler": "getAudit" }`

---

### Section 5: Service-Level Enforcement

`@PreEnforce` and `@PostEnforce` work on any injectable class method, not just controllers.
This section demonstrates policy enforcement on a `PatientService` class. The controller is
a thin pass-through -- all authorization happens on the service methods.

**Service:** `src/patient.service.ts`
**Controller:** `src/service-demo.controller.ts`
**Handler:** `src/handlers/cap-transfer.handler.ts`

#### 5.1 Basic Service-Level @PreEnforce

The simplest case: a `@PreEnforce` decorator on a service method. The PDP permits
clinicians to list patients with no constraints attached.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/services/patients | jq
```

Expected: array of 3 patient records.

```bash
# Participant: denied
curl -s -H "Authorization: Bearer $PARTICIPANT_TOKEN" http://localhost:3000/api/services/patients | jq
```

Expected: 403 Forbidden.

#### 5.2 Argument Manipulation -- Policy-Driven Transfer Limit

This is the key new capability. The `CapTransferHandler` modifies `context.args[0]`
(the `amount` parameter) before the service method executes. The policy caps transfers
at 5000 -- the service method never sees the original amount.

**How it works:**

1. Controller receives `POST /api/services/transfer?amount=10000`
2. Controller calls `patientService.transfer(10000)`
3. AOP aspect intercepts `transfer` (it has `@PreEnforce`)
4. Aspect captures `args = [10000]`
5. PDP returns PERMIT with obligation `{ "type": "capTransferAmount", "maxAmount": 5000, "argIndex": 0 }`
6. Bundle builds `MethodInvocationContext { request, args: [10000], methodName: "transfer", className: "PatientService" }`
7. `CapTransferHandler` runs: `10000 > 5000`, so `context.args[0] = 5000`
8. Aspect calls `method(...invocationContext.args)` -- `transfer(5000)`
9. Service returns `"Transferred 5000"`

The handler never touches the HTTP request. It modifies the method's arguments directly.
This pattern works identically for controllers and services.

```bash
# Over the limit: 10000 gets capped to 5000
curl -s -X POST -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/services/transfer?amount=10000' | jq

# Under the limit: 3000 passes through unchanged
curl -s -X POST -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/services/transfer?amount=3000' | jq
```

Expected (over limit): `"Transferred 5000"`
Expected (under limit): `"Transferred 3000"`

#### 5.3 @PostEnforce on Service Method

The service method executes first, then the PDP sees the return value. The policy
attaches a `filterJsonContent` obligation to blacken the SSN.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/services/patients/P-001 | jq
```

Expected: `{ "id": "P-001", "name": "Jane Doe", "ssn": "*******6789", ... }`

#### 5.4 Mapping Handler on Service Return Value

The `redactFields` obligation replaces `ssn` and `insurance` with `"[REDACTED]"`.

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/services/patients/P-001/summary | jq
```

Expected: `{ ..., "ssn": "[REDACTED]", "insurance": "[REDACTED]", ... }`

#### 5.5 Combined: Log + Filter on Service Method

Multiple obligations work together: log access and filter results by classification level.
Only PUBLIC and INTERNAL patients are returned.

```bash
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/services/patients/search?q=healthy' | jq
```

Expected: patients matching "healthy" with classification PUBLIC or INTERNAL only
(P-002 with CONFIDENTIAL classification is filtered out).

---

## Constraint Handler Reference

| Interface                                   | Method Signature       | When It Runs                          | Demo Handler                  |
|---------------------------------------------|------------------------|---------------------------------------|-------------------------------|
| `RunnableConstraintHandlerProvider`         | `() => void`           | On decision, before method            | `LogAccessHandler`            |
| `ConsumerConstraintHandlerProvider`         | `(value) => void`      | After method, side-effect on response | `AuditTrailHandler`           |
| `MappingConstraintHandlerProvider`          | `(value) => any`       | After method, transforms response     | `RedactFieldsHandler`         |
| `FilterPredicateConstraintHandlerProvider`  | `(element) => boolean` | After method, filters arrays          | `ClassificationFilterHandler` |
| `MethodInvocationConstraintHandlerProvider` | `(context: MethodInvocationContext) => void` | Before method, modifies request/args | `InjectTimestampHandler`, `CapTransferHandler` |
| `ErrorHandlerProvider`                      | `(error) => void`      | On error, side-effect                 | `NotifyOnErrorHandler`        |
| `ErrorMappingConstraintHandlerProvider`     | `(error) => Error`     | On error, transforms error            | `EnrichErrorHandler`          |

All handlers are registered by decorating the class with `@SaplConstraintHandler(type)` and adding
it as a provider in a NestJS module. The `ConstraintEnforcementService` auto-discovers them at startup.

## SAPL Policies

Policies are in the `policies/` directory and loaded by the sapl-node PDP:

| Policy                          | Effect              | What It Does                                                      |
|---------------------------------|---------------------|-------------------------------------------------------------------|
| permit-read-hello               | PERMIT              | Any user, action "read", resource "hello"                         |
| permit-clinician-export         | PERMIT              | Clinician whose pilotId matches, time-gated                       |
| permit-clinician-read-patient   | PERMIT + obligation | Blackens SSN via filterJsonContent                                |
| permit-clinician-patient-full   | PERMIT + obligation | Blacken + delete + replace combined                               |
| permit-clinician-logged         | PERMIT + obligation | logAccess (RunnableConstraintHandlerProvider)                     |
| permit-clinician-audited        | PERMIT + obligation | auditTrail (ConsumerConstraintHandlerProvider)                    |
| permit-clinician-redacted       | PERMIT + obligation | redactFields (MappingConstraintHandlerProvider)                   |
| permit-clinician-documents      | PERMIT + obligation | filterByClassification (FilterPredicateConstraintHandlerProvider) |
| permit-clinician-timestamped    | PERMIT + obligation | injectTimestamp (MethodInvocationConstraintHandlerProvider)       |
| permit-clinician-error-handling | PERMIT + obligation | notifyOnError + enrichError (error pipeline)                      |
| permit-clinician-replaced       | PERMIT + transform  | PDP replaces the resource entirely                                |
| permit-clinician-advised        | PERMIT + advice     | logAccess + unhandled advice (best-effort)                        |
| permit-clinician-read-record    | PERMIT              | Clinician reads records (@PostEnforce)                            |
| permit-clinician-read-audit     | PERMIT              | Clinician reads audit logs (@PostEnforce)                         |
| permit-read-secret              | PERMIT + obligation | Unknown obligation type (fail-fast demo)                          |
| permit-clinician-service-list-patients | PERMIT       | Clinician lists patients (service-level)                          |
| permit-clinician-service-find-patient  | PERMIT + obligation | logAccess on service method                                |
| permit-clinician-service-patient-detail | PERMIT + obligation | Blackens SSN via filterJsonContent (@PostEnforce)        |
| permit-clinician-service-patient-summary | PERMIT + obligation | redactFields on ssn + insurance                        |
| permit-clinician-service-search-patients | PERMIT + obligation | logAccess + filterByClassification                      |
| permit-clinician-service-transfer | PERMIT + obligation | capTransferAmount + logAccess (argument manipulation)        |

## Endpoint Reference

| #   | Path                                   | Decorator      | Section        | What It Demonstrates                      |
|-----|----------------------------------------|----------------|----------------|-------------------------------------------|
| 1.1 | GET /api/hello                         | Manual         | Basic          | `PdpService.decideOnce()`                 |
| 1.2 | GET /api/exportData/:p/:s              | `@PreEnforce`  | Basic          | Custom resource builder, ABAC             |
| 1.3 | GET /api/exportData2/:p/:s             | `@PreEnforce`  | Basic          | Custom onDeny handler                     |
| 2.1 | GET /api/constraints/patient           | `@PreEnforce`  | Content Filter | Blacken SSN                               |
| 2.2 | GET /api/constraints/patient-full      | `@PreEnforce`  | Content Filter | Blacken + delete + replace                |
| 3.1 | GET /api/constraints/logged            | `@PreEnforce`  | Custom Handler | RunnableConstraintHandlerProvider         |
| 3.2 | GET /api/constraints/audited           | `@PreEnforce`  | Custom Handler | ConsumerConstraintHandlerProvider         |
| --  | GET /api/constraints/audit-log         | None           | Custom Handler | View audit trail (auxiliary)              |
| 3.3 | GET /api/constraints/redacted          | `@PreEnforce`  | Custom Handler | MappingConstraintHandlerProvider          |
| 3.4 | GET /api/constraints/documents         | `@PreEnforce`  | Custom Handler | FilterPredicateConstraintHandlerProvider  |
| 3.5 | GET /api/constraints/timestamped       | `@PreEnforce`  | Custom Handler | MethodInvocationConstraintHandlerProvider |
| 3.6 | GET /api/constraints/error-demo        | `@PreEnforce`  | Custom Handler | ErrorHandler + ErrorMapping               |
| 4.1 | GET /api/constraints/resource-replaced | `@PreEnforce`  | Advanced       | PDP resource replacement                  |
| 4.2 | GET /api/constraints/advised           | `@PreEnforce`  | Advanced       | Advice (best-effort)                      |
| 4.3 | GET /api/constraints/record/:id        | `@PostEnforce` | Advanced       | ctx.returnValue                           |
| 4.4 | GET /api/constraints/unhandled         | `@PreEnforce`  | Advanced       | Unhandled obligation (fail-fast)          |
| 4.5 | GET /api/constraints/audit             | `@PostEnforce` | Advanced       | onDeny callback                           |
| 5.1 | GET /api/services/patients             | `@PreEnforce`  | Service        | Service-level basic enforcement           |
| 5.2 | POST /api/services/transfer            | `@PreEnforce`  | Service        | Argument manipulation (capTransferAmount) |
| 5.3 | GET /api/services/patients/:id         | `@PostEnforce` | Service        | @PostEnforce on service method            |
| 5.4 | GET /api/services/patients/:id/summary | `@PreEnforce`  | Service        | Mapping handler on service return         |
| 5.5 | GET /api/services/patients/search      | `@PreEnforce`  | Service        | Combined: log + filter                    |

## Stopping

```bash
docker compose down
```

## License

Apache-2.0
