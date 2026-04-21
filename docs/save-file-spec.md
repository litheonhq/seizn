# Seizn Save-File Format (SZN1)

SZN1 is a signed portable bundle for embedding Seizn NPC state inside game save files.
It carries the memories, belief shards, and canon locks needed to restore one NPC in
another Seizn project.

## Wire Format

All integer fields are big-endian.

```text
[4 bytes magic "SZN1"][8 bytes gzip body length][gzip(json body)][64 bytes ed25519 signature][32 bytes raw ed25519 public key]
```

The signature covers the 12-byte header plus the gzip body. A loader must verify the
signature before decompressing or importing the JSON body.

## JSON Body

```json
{
  "version": "SZN1",
  "exportedAt": "2026-04-21T00:00:00.000Z",
  "studioId": "00000000-0000-4000-8000-000000000001",
  "npcId": "kaelan",
  "schemaVersion": 1,
  "memories": [],
  "beliefs": [],
  "canonLocks": [],
  "meta": {
    "memoryCount": 0,
    "beliefCount": 0,
    "canonLockCount": 0
  }
}
```

## Signing

Each studio has one active Ed25519 keypair in `studio_signing_keys`. The public key is
stored as raw base64. The private key is stored as AES-256-GCM encrypted PKCS8 DER and
is decrypted only by server-side save-file export code using `SEIZN_SIGNING_MASTER_KEY`.

The public key is appended to each file so importers can verify portability without a
separate key lookup. Trust decisions, such as allowing only known studio keys, can be
added by the host application before import.

## CLI

```bash
seizn save export <npc_id> <out.szs>
seizn save import <in.szs>
```

`export` downloads a signed `.szs` file from `/api/save-file/export/[npcId]`.
`import` posts that file to `/api/save-file/import` and restores memories, beliefs,
and canon locks into the authenticated project.

## Error Handling

Importers must reject:

- Missing or invalid `SZN1` magic bytes.
- Body length that does not match the actual file length.
- Any Ed25519 signature failure.
- Unsupported `version` or `schemaVersion`.

Tampering with any header or body byte changes the signed bytes and fails verification.
