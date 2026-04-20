# COPPA 2026 and GDPR-K Memory Compliance

This note summarizes the Seizn controls added for customer-managed child-safety and data-subject-rights workflows. It is implementation guidance, not legal advice.

## What Seizn now provides

| Requirement | Seizn control | Customer responsibility |
| --- | --- | --- |
| Data subject export | `POST /api/v1/dsr/export` creates an organization-scoped job and signed JSON archive URL for memories, subject-linked audit logs, and subject-linked interactions. | Provide the same stable `subject_id` on memory writes and DSR requests. |
| Right to erasure | `POST /api/v1/dsr/delete` soft-deletes subject memories, overwrites encrypted memory payloads with zero material, and returns a signed deletion certificate. | Verify the requester's identity and decide whether legal exceptions require retention. |
| COPPA under-13 retention gate | `consent_records` stores verifiable consent evidence. `POST /api/v1/memories` rejects `age_bracket=minor_under_13` writes without active consent. | Run the verifiable parental consent flow and store an opaque proof token before retaining memory. |
| Auditability | `GET /api/v1/audit` and `GET /api/v1/audit/export` expose filtered audit logs. DSR deletion emits `dsr.deleted` in the regular audit log and tamper-evident audit chain. | Set internal retention policy and keep regulator-facing evidence packages. |
| Minor data minimization | `policyFor('minor_under_13')` disables voiceprint/profiling and sets a short retention policy for runtime callers. | Pass the correct `age_bracket` and avoid storing prohibited sensitive identifiers. |

## API contract

Memory writes can include:

```json
{
  "content": "Mira helped player_7f4a find the shrine key",
  "subject_id": "player_7f4a",
  "age_bracket": "minor_under_13"
}
```

Under-13 writes require an active `consent_records` row with:

```json
{
  "organization_id": "<org uuid>",
  "subject_id": "player_7f4a",
  "bracket": "minor_under_13",
  "parent_proof": "<opaque consent vendor token>",
  "granted_at": "2026-04-20T00:00:00.000Z"
}
```

DSR export:

```bash
curl -X POST https://www.seizn.com/api/v1/dsr/export \
  -H "Authorization: Bearer $SEIZN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subject_id":"player_7f4a"}'
```

DSR delete:

```bash
curl -X POST https://www.seizn.com/api/v1/dsr/delete \
  -H "Authorization: Bearer $SEIZN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subject_id":"player_7f4a","reason":"GDPR Article 17 request"}'
```

## Important boundaries

Seizn does not verify the identity of the requester, collect parental proof directly, decide legal exceptions, or replace a publisher's privacy program. The product now supplies durable hooks and evidence artifacts so a publisher can execute its own compliance workflow without manual SQL.

Customers should treat `subject_id` as a pseudonymous player identifier, not an email address, phone number, device fingerprint, voiceprint, or other regulated persistent identifier unless their privacy basis explicitly allows it.
