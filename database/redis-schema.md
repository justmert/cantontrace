# CantonTrace Redis Schema

Redis is used as a caching and real-time state layer alongside PostgreSQL.
All keys follow a namespaced pattern to avoid collisions. TTLs are set
to balance freshness with load on the Canton Ledger API.

---

## Key Patterns

### Session & Connection Cache

#### `session:{connectionId}`
Cached bootstrap information for an active connection. Contains the
full connection state (offsets, party rights, API version) so the
frontend can restore sessions without re-querying the Ledger API.

- **Type:** Hash
- **TTL:** 1 hour (3600s)
- **Fields:**
  - `ledgerApiEndpoint` — gRPC endpoint URL
  - `apiVersion` — Ledger API version string
  - `userId` — Authenticated user ID
  - `partyRights` — JSON string of party-rights array
  - `currentOffset` — Ledger end offset at last check
  - `pruningOffset` — Pruning boundary offset
  - `connectedAt` — ISO 8601 timestamp
  - `status` — Connection status (active/disconnected/error)
- **Set by:** Engine Service on connection bootstrap
- **Invalidated:** On disconnect or connection error

---

### Active Contract Set (ACS)

#### `acs:{connectionId}:{offset}`
Cached ACS snapshot at a specific ledger offset. Since the ACS changes
with every transaction, these caches have short TTLs. The offset in
the key ensures stale snapshots are not reused.

- **Type:** String (compressed JSON)
- **TTL:** 5 minutes (300s)
- **Value:** JSON array of active contracts with template IDs, contract
  IDs, contract arguments, signatories, and observers
- **Set by:** Engine Service on ACS query
- **Notes:** Large ACS snapshots may be split across multiple keys
  using `acs:{connectionId}:{offset}:chunk:{n}` with a manifest key
  at the base path. Consider compression for snapshots > 1MB.

---

### Package Cache

#### `packages:{connectionId}`
Cached list of all packages available on the connected participant.
Used by the Package Explorer and as a lookup index for template resolution.

- **Type:** String (JSON)
- **TTL:** 30 minutes (1800s)
- **Value:** JSON array of package summaries:
  ```json
  [
    {
      "packageId": "abc123...",
      "packageName": "my-app",
      "packageVersion": "1.0.0",
      "hasSource": true
    }
  ]
  ```
- **Set by:** Engine Service on package list query
- **Invalidated:** When a new DAR is uploaded

#### `package:{packageId}`
Cached metadata for a single package. Contains the full parsed module
structure (templates, choices, data types). Package content is immutable
(same package ID always has same content), so this can have a longer TTL.

- **Type:** String (JSON)
- **TTL:** 1 hour (3600s)
- **Value:** Full package metadata JSON matching the `package_metadata`
  PostgreSQL table schema
- **Set by:** Engine Service on package metadata query
- **Notes:** Package IDs are content-addressed hashes, so caching is
  safe — the content for a given ID never changes.

---

### Ledger Offsets

#### `offset:{connectionId}:current`
The current ledger end offset for this connection. Polled frequently
by the frontend to show real-time ledger progress and to detect new
transactions.

- **Type:** String
- **TTL:** 30 seconds (30s)
- **Value:** Hex-encoded ledger offset string
- **Set by:** Engine Service offset polling loop
- **Notes:** Short TTL because the ledger end changes with every
  committed transaction. The polling loop refreshes this every
  few seconds.

#### `offset:{connectionId}:pruning`
The pruning boundary offset — the earliest offset that can be read.
Changes infrequently (only when pruning is triggered by the operator).

- **Type:** String
- **TTL:** 5 minutes (300s)
- **Value:** Hex-encoded ledger offset string
- **Set by:** Engine Service on bootstrap and periodic refresh
- **Notes:** Pruning boundaries change rarely, so a longer TTL is safe.
  The frontend uses this to prevent users from querying pruned ranges.

---

### Event Stream State

#### `stream:{connectionId}:lastOffset`
The last offset processed by the event stream consumer for this
connection. Used to resume streaming after reconnection without
missing or duplicating events. Has no TTL because stream position
must survive cache eviction.

- **Type:** String
- **TTL:** None (persistent)
- **Value:** Hex-encoded ledger offset string
- **Set by:** Engine Service event stream consumer
- **Notes:** This key is critical for exactly-once event processing.
  It must not expire. The Engine Service updates this after
  successfully processing each batch of events. On reconnection,
  the stream resumes from this offset + 1.

---

### Template Cache

#### `template:{packageId}:{moduleName}:{templateName}`
Cached template definition including fields, choices, key definition,
signatories, and observers. Used by the Transaction Trace Viewer and
Command Builder for auto-complete and validation.

- **Type:** String (JSON)
- **TTL:** 1 hour (3600s)
- **Value:** Full template definition:
  ```json
  {
    "packageId": "abc123...",
    "moduleName": "Main",
    "templateName": "Asset",
    "fields": [
      {"name": "issuer", "type": "Party"},
      {"name": "owner", "type": "Party"},
      {"name": "details", "type": "AssetDetails"}
    ],
    "key": {
      "type": "Party",
      "maintainer": "issuer"
    },
    "signatories": ["issuer"],
    "observers": ["owner"],
    "choices": [
      {
        "name": "Transfer",
        "consuming": true,
        "argType": {"fields": [{"name": "newOwner", "type": "Party"}]},
        "returnType": "ContractId Asset"
      }
    ]
  }
  ```
- **Set by:** Engine Service on template resolution
- **Notes:** Like packages, template definitions within a specific
  package ID are immutable. The TTL is a safety net for memory
  management rather than correctness.

---

## Key Naming Conventions

| Prefix        | Scope                | Example                                               |
|---------------|----------------------|-------------------------------------------------------|
| `session:`    | Per connection       | `session:a1b2c3d4-e5f6-7890-abcd-ef1234567890`       |
| `acs:`        | Per connection+offset| `acs:a1b2c3d4-...:00000000000000002f`                 |
| `packages:`   | Per connection       | `packages:a1b2c3d4-e5f6-7890-abcd-ef1234567890`      |
| `package:`    | Global (by hash)     | `package:abc123def456...`                             |
| `offset:`     | Per connection       | `offset:a1b2c3d4-...:current`                         |
| `stream:`     | Per connection       | `stream:a1b2c3d4-...:lastOffset`                      |
| `template:`   | Global (by hash)     | `template:abc123:Main:Asset`                          |

---

## TTL Summary

| Key Pattern                          | TTL         | Reason                                           |
|--------------------------------------|-------------|--------------------------------------------------|
| `session:{connectionId}`             | 1 hour      | Session data changes infrequently                |
| `acs:{connectionId}:{offset}`        | 5 minutes   | ACS changes with every transaction               |
| `packages:{connectionId}`            | 30 minutes  | Package list changes only on DAR upload          |
| `package:{packageId}`                | 1 hour      | Immutable content (hash-addressed)               |
| `offset:{connectionId}:current`      | 30 seconds  | Changes with every committed transaction         |
| `offset:{connectionId}:pruning`      | 5 minutes   | Changes rarely (operator-triggered pruning)      |
| `stream:{connectionId}:lastOffset`   | None        | Must survive eviction for exactly-once semantics |
| `template:{packageId}:*`             | 1 hour      | Immutable content (safety TTL only)              |

---

## Memory Management

- Monitor Redis memory usage with `INFO memory`
- Set `maxmemory-policy allkeys-lru` to evict least-recently-used keys
  under memory pressure (except `stream:*:lastOffset` keys which should
  use a separate Redis database or be persisted)
- ACS snapshots are the largest cache entries; monitor their size
- Consider using Redis Cluster for production deployments with many
  concurrent connections

---

## Pub/Sub Channels

In addition to cached keys, CantonTrace uses Redis Pub/Sub for real-time
event distribution:

| Channel                              | Purpose                                          |
|--------------------------------------|--------------------------------------------------|
| `events:{connectionId}`              | Live transaction/completion events for SSE stream|
| `alerts:{connectionId}`              | Triggered alert notifications                    |
| `sandbox:{sandboxId}:status`         | Sandbox lifecycle status changes                 |
