#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# CantonTrace Demo Seed Script
# Seeds a Canton sandbox with realistic demo data
# ============================================================

CANTON_HOST="${CANTON_HOST:-canton-sandbox}"
CANTON_PORT="${CANTON_PORT:-10000}"
CANTON_ADDR="${CANTON_HOST}:${CANTON_PORT}"
DAR_PATH="/demo/cantontrace-test-1.0.0.dar"
MAX_WAIT_SECONDS=300

# Package name — set after DAR upload discovery
PACKAGE_NAME="cantontrace-test"

# Counters for summary
CONTRACTS_CREATED=0
EXERCISES_DONE=0
ERRORS_TRIGGERED=0

# ============================================================
# Helper functions
# ============================================================

log() {
  echo "[demo-seed] $(date '+%H:%M:%S') $*" >&2
}

err() {
  echo "[demo-seed] ERROR: $*" >&2
}

# Call a gRPC method with JSON payload, return the response
grpc_call() {
  local service="$1"
  local payload="$2"
  echo "$payload" | grpcurl -plaintext -d @ "$CANTON_ADDR" "$service" 2>&1
}

# Generate a unique command ID
cmd_id() {
  echo "demo-$(date +%s%N)-$RANDOM"
}

# Standard transaction format for SubmitAndWait responses
TX_FORMAT='{
  "event_format": {
    "filters_for_any_party": {
      "cumulative": [{"wildcard_filter": {"include_created_event_blob": false}}]
    },
    "verbose": true
  },
  "transaction_shape": "TRANSACTION_SHAPE_LEDGER_EFFECTS"
}'

# Submit a create command and return the full response
submit_create() {
  local act_as="$1"
  local read_as="$2"
  local module_name="$3"
  local entity_name="$4"
  local fields_json="$5"

  local command_id
  command_id=$(cmd_id)

  local payload
  payload=$(jq -n \
    --arg user_id "demo-user" \
    --arg command_id "$command_id" \
    --arg act_as "$act_as" \
    --arg read_as "$read_as" \
    --arg module_name "$module_name" \
    --arg entity_name "$entity_name" \
    --argjson fields "$fields_json" \
    --argjson tx_format "$TX_FORMAT" \
    --arg pkg_name "$PACKAGE_NAME" \
    '{
      "commands": {
        "user_id": $user_id,
        "command_id": $command_id,
        "act_as": [$act_as],
        "read_as": (if $read_as == "" then [] else [$read_as] end),
        "package_id_selection_preference": [$pkg_name],
        "commands": [
          {
            "create": {
              "template_id": {
                "package_id": $pkg_name,
                "module_name": $module_name,
                "entity_name": $entity_name
              },
              "create_arguments": {
                "fields": $fields
              }
            }
          }
        ]
      },
      "transaction_format": $tx_format
    }')

  local response
  response=$(grpc_call "com.daml.ledger.api.v2.CommandService/SubmitAndWaitForTransaction" "$payload")

  if echo "$response" | jq -e '.transaction' > /dev/null 2>&1; then
    CONTRACTS_CREATED=$((CONTRACTS_CREATED + 1))
    echo "$response"
  else
    err "Create $module_name.$entity_name failed: $response"
    echo "$response"
    return 1
  fi
}

# Submit an exercise command and return the full response
submit_exercise() {
  local act_as="$1"
  local module_name="$2"
  local entity_name="$3"
  local contract_id="$4"
  local choice="$5"
  local choice_arg_json="$6"

  local command_id
  command_id=$(cmd_id)

  local payload
  payload=$(jq -n \
    --arg user_id "demo-user" \
    --arg command_id "$command_id" \
    --arg act_as "$act_as" \
    --arg module_name "$module_name" \
    --arg entity_name "$entity_name" \
    --arg contract_id "$contract_id" \
    --arg choice "$choice" \
    --argjson choice_arg "$choice_arg_json" \
    --argjson tx_format "$TX_FORMAT" \
    --arg pkg_name "$PACKAGE_NAME" \
    '{
      "commands": {
        "user_id": $user_id,
        "command_id": $command_id,
        "act_as": [$act_as],
        "package_id_selection_preference": [$pkg_name],
        "commands": [
          {
            "exercise": {
              "template_id": {
                "package_id": $pkg_name,
                "module_name": $module_name,
                "entity_name": $entity_name
              },
              "contract_id": $contract_id,
              "choice": $choice,
              "choice_argument": {
                "record": $choice_arg
              }
            }
          }
        ]
      },
      "transaction_format": $tx_format
    }')

  local response
  response=$(grpc_call "com.daml.ledger.api.v2.CommandService/SubmitAndWaitForTransaction" "$payload")

  if echo "$response" | jq -e '.transaction' > /dev/null 2>&1; then
    EXERCISES_DONE=$((EXERCISES_DONE + 1))
    echo "$response"
  else
    err "Exercise $choice on $entity_name failed: $response"
    echo "$response"
    return 1
  fi
}

# Submit a command that is expected to fail (for error testing)
submit_create_expect_fail() {
  local act_as="$1"
  local module_name="$2"
  local entity_name="$3"
  local fields_json="$4"
  local description="$5"

  local command_id
  command_id=$(cmd_id)

  local payload
  payload=$(jq -n \
    --arg user_id "demo-user" \
    --arg command_id "$command_id" \
    --arg act_as "$act_as" \
    --arg module_name "$module_name" \
    --arg entity_name "$entity_name" \
    --argjson fields "$fields_json" \
    --argjson tx_format "$TX_FORMAT" \
    --arg pkg_name "$PACKAGE_NAME" \
    '{
      "commands": {
        "user_id": $user_id,
        "command_id": $command_id,
        "act_as": [$act_as],
        "package_id_selection_preference": [$pkg_name],
        "commands": [
          {
            "create": {
              "template_id": {
                "package_id": $pkg_name,
                "module_name": $module_name,
                "entity_name": $entity_name
              },
              "create_arguments": {
                "fields": $fields
              }
            }
          }
        ]
      },
      "transaction_format": $tx_format
    }')

  local response
  response=$(grpc_call "com.daml.ledger.api.v2.CommandService/SubmitAndWaitForTransaction" "$payload") || true

  if echo "$response" | grep -qi "error\|INVALID_ARGUMENT\|FAILED_PRECONDITION"; then
    log "  Expected failure ($description): confirmed"
    ERRORS_TRIGGERED=$((ERRORS_TRIGGERED + 1))
  else
    log "  Warning: expected failure ($description) but got: $response"
  fi
}

submit_exercise_expect_fail() {
  local act_as="$1"
  local module_name="$2"
  local entity_name="$3"
  local contract_id="$4"
  local choice="$5"
  local choice_arg_json="$6"
  local description="$7"

  local command_id
  command_id=$(cmd_id)

  local payload
  payload=$(jq -n \
    --arg user_id "demo-user" \
    --arg command_id "$command_id" \
    --arg act_as "$act_as" \
    --arg module_name "$module_name" \
    --arg entity_name "$entity_name" \
    --arg contract_id "$contract_id" \
    --arg choice "$choice" \
    --argjson choice_arg "$choice_arg_json" \
    --argjson tx_format "$TX_FORMAT" \
    --arg pkg_name "$PACKAGE_NAME" \
    '{
      "commands": {
        "user_id": $user_id,
        "command_id": $command_id,
        "act_as": [$act_as],
        "package_id_selection_preference": [$pkg_name],
        "commands": [
          {
            "exercise": {
              "template_id": {
                "package_id": $pkg_name,
                "module_name": $module_name,
                "entity_name": $entity_name
              },
              "contract_id": $contract_id,
              "choice": $choice,
              "choice_argument": {
                "record": $choice_arg
              }
            }
          }
        ]
      },
      "transaction_format": $tx_format
    }')

  local response
  response=$(grpc_call "com.daml.ledger.api.v2.CommandService/SubmitAndWaitForTransaction" "$payload") || true

  if echo "$response" | grep -qi "error\|INVALID_ARGUMENT\|FAILED_PRECONDITION"; then
    log "  Expected failure ($description): confirmed"
    ERRORS_TRIGGERED=$((ERRORS_TRIGGERED + 1))
  else
    log "  Warning: expected failure ($description) but got: $response"
  fi
}

# Extract the first created contract_id from a SubmitAndWait response
extract_contract_id() {
  local response="$1"
  echo "$response" | jq -r '
    .transaction.events[]?
    | select(.created != null)
    | .created.contract_id
  ' | head -1
}

# Extract all created contract_ids from a SubmitAndWait response
extract_all_contract_ids() {
  local response="$1"
  echo "$response" | jq -r '
    .transaction.events[]?
    | select(.created != null)
    | .created.contract_id
  '
}

# ============================================================
# Step 0: Wait for Canton to be ready
# ============================================================

log "Waiting for Canton sandbox at $CANTON_ADDR ..."
WAITED=0
until grpcurl -plaintext "$CANTON_ADDR" grpc.health.v1.Health/Check > /dev/null 2>&1; do
  sleep 2
  WAITED=$((WAITED + 2))
  if [ "$WAITED" -ge "$MAX_WAIT_SECONDS" ]; then
    err "Canton did not become healthy within ${MAX_WAIT_SECONDS}s. Aborting."
    exit 1
  fi
done
log "Canton is healthy (waited ${WAITED}s)"

# ============================================================
# Step 1: Check if demo was already seeded
# ============================================================

log "Checking if demo data already exists..."
EXISTING_PARTIES=$(grpc_call "com.daml.ledger.api.v2.admin.PartyManagementService/ListKnownParties" '{}' \
  | jq -r '.party_details[]?.party // empty' 2>/dev/null || echo "")

if echo "$EXISTING_PARTIES" | grep -q "Alice\|alice"; then
  log "Demo data appears to already exist (found Alice party). Exiting gracefully."
  exit 0
fi

# ============================================================
# Step 2: Allocate parties
# ============================================================

log "Allocating parties..."

allocate_party() {
  local hint="$1"
  local display="$2"
  local response
  local party_id

  # Retry allocation — synchronizer may not be fully connected yet
  for attempt in $(seq 1 20); do
    response=$(grpc_call \
      "com.daml.ledger.api.v2.admin.PartyManagementService/AllocateParty" \
      "{\"party_id_hint\": \"$hint\"}")

    party_id=$(echo "$response" | jq -r '.party_details.party // empty' 2>/dev/null)
    if [ -n "$party_id" ]; then
      echo "$party_id"
      return 0
    fi

    if echo "$response" | grep -q "SYNCHRONIZER"; then
      # Synchronizer not connected yet — wait and retry
      [ "$attempt" -eq 1 ] && log "  Waiting for synchronizer connection..."
      sleep 5
      continue
    fi

    # Some other error — fail
    err "Failed to allocate party $hint: $response"
    exit 1
  done

  err "Failed to allocate party $hint after 20 attempts"
  exit 1
}

ALICE_PARTY=$(allocate_party "Alice" "Alice - Token Issuer")
log "  Alice: $ALICE_PARTY"

BOB_PARTY=$(allocate_party "Bob" "Bob - Counterparty")
log "  Bob: $BOB_PARTY"

CHARLIE_PARTY=$(allocate_party "Charlie" "Charlie - Third Party")
log "  Charlie: $CHARLIE_PARTY"

BANK_PARTY=$(allocate_party "Bank" "Bank - Institutional Issuer")
log "  Bank: $BANK_PARTY"

log "Allocated 4 parties"

# ============================================================
# Step 3: Upload DAR
# ============================================================

log "Uploading DAR file..."

if [ ! -f "$DAR_PATH" ]; then
  err "DAR file not found at $DAR_PATH"
  exit 1
fi

# Use a temp file for the DAR upload payload — the base64 is too large for shell args
DAR_PAYLOAD_FILE=$(mktemp /tmp/dar-upload-XXXXXX.json)
printf '{"dar_file": "' > "$DAR_PAYLOAD_FILE"
base64 -w 0 "$DAR_PATH" 2>/dev/null >> "$DAR_PAYLOAD_FILE" || base64 "$DAR_PATH" | tr -d '\n' >> "$DAR_PAYLOAD_FILE"
printf '"}' >> "$DAR_PAYLOAD_FILE"

UPLOAD_RESPONSE=$(grpcurl -plaintext -d @ "$CANTON_ADDR" \
  "com.daml.ledger.api.v2.admin.PackageManagementService/UploadDarFile" \
  < "$DAR_PAYLOAD_FILE" 2>&1)
rm -f "$DAR_PAYLOAD_FILE"

if echo "$UPLOAD_RESPONSE" | grep -qi "error"; then
  # Check if it's a "already exists" error, which is fine
  if echo "$UPLOAD_RESPONSE" | grep -qi "already exists\|ALREADY_EXISTS"; then
    log "  DAR already uploaded (OK)"
  else
    err "DAR upload failed: $UPLOAD_RESPONSE"
    exit 1
  fi
else
  log "  DAR uploaded successfully"
fi

# Discover the package ID for our DAR via ListKnownPackages (admin API)
log "  Discovering package ID..."
KNOWN_PKGS=$(grpc_call "com.daml.ledger.api.v2.admin.PackageManagementService/ListKnownPackages" "{}")
PACKAGE_ID=$(echo "$KNOWN_PKGS" | jq -r '.package_details[] | select(.name == "cantontrace-test") | .package_id' 2>/dev/null | head -1)
if [ -z "$PACKAGE_ID" ]; then
  err "Could not find cantontrace-test package after upload"
  exit 1
fi
PACKAGE_NAME="$PACKAGE_ID"
log "  Package ID: ${PACKAGE_ID:0:20}..."

# ============================================================
# Step 4: Create user with rights
# ============================================================

log "Creating demo user..."

CREATE_USER_RESPONSE=$(grpc_call \
  "com.daml.ledger.api.v2.admin.UserManagementService/CreateUser" \
  "{\"user\": {\"id\": \"demo-user\", \"primary_party\": \"$ALICE_PARTY\"}}") || true

if echo "$CREATE_USER_RESPONSE" | grep -qi "ALREADY_EXISTS"; then
  log "  User demo-user already exists (OK)"
else
  log "  Created user demo-user"
fi

log "Granting user rights..."

RIGHTS_PAYLOAD=$(jq -n \
  --arg alice "$ALICE_PARTY" \
  --arg bob "$BOB_PARTY" \
  --arg charlie "$CHARLIE_PARTY" \
  --arg bank "$BANK_PARTY" \
  '{
    "user_id": "demo-user",
    "rights": [
      {"can_act_as": {"party": $alice}},
      {"can_act_as": {"party": $bob}},
      {"can_act_as": {"party": $charlie}},
      {"can_act_as": {"party": $bank}},
      {"can_read_as": {"party": $alice}},
      {"can_read_as": {"party": $bob}},
      {"can_read_as": {"party": $charlie}},
      {"can_read_as": {"party": $bank}}
    ]
  }')

GRANT_RESPONSE=$(grpc_call \
  "com.daml.ledger.api.v2.admin.UserManagementService/GrantUserRights" \
  "$RIGHTS_PAYLOAD") || true

log "  User rights granted"

# ============================================================
# Step 5: Create demo contracts
# ============================================================

# --------------------------------------------------
# 5a: Bank creates 5 USD SimpleTokens for Alice
# --------------------------------------------------

log "Creating tokens..."
log "  Bank issuing USD tokens for Alice..."

USD_TOKEN_IDS=()
USD_AMOUNTS=(1000 500 250 100 50)

for i in "${!USD_AMOUNTS[@]}"; do
  AMT="${USD_AMOUNTS[$i]}"
  TOKEN_NUM=$((i + 1))

  FIELDS=$(jq -n \
    --arg issuer "$BANK_PARTY" \
    --arg owner "$ALICE_PARTY" \
    --arg amount "${AMT}.0" \
    --arg tokenId "usd-$(printf '%03d' $TOKEN_NUM)" \
    '[
      {"label": "issuer",   "value": {"party": $issuer}},
      {"label": "owner",    "value": {"party": $owner}},
      {"label": "amount",   "value": {"numeric": $amount}},
      {"label": "currency", "value": {"text": "USD"}},
      {"label": "tokenId",  "value": {"text": $tokenId}}
    ]')

  RESPONSE=$(submit_create "$BANK_PARTY" "$ALICE_PARTY" "Main" "SimpleToken" "$FIELDS")
  CID=$(extract_contract_id "$RESPONSE")
  USD_TOKEN_IDS+=("$CID")
  log "    USD $AMT token: $CID"
done

# --------------------------------------------------
# 5b: Bank creates 3 EUR SimpleTokens for Bob
# --------------------------------------------------

log "  Bank issuing EUR tokens for Bob..."

EUR_TOKEN_IDS=()
EUR_AMOUNTS=(2000 1000 500)

for i in "${!EUR_AMOUNTS[@]}"; do
  AMT="${EUR_AMOUNTS[$i]}"
  TOKEN_NUM=$((i + 1))

  FIELDS=$(jq -n \
    --arg issuer "$BANK_PARTY" \
    --arg owner "$BOB_PARTY" \
    --arg amount "${AMT}.0" \
    --arg tokenId "eur-$(printf '%03d' $TOKEN_NUM)" \
    '[
      {"label": "issuer",   "value": {"party": $issuer}},
      {"label": "owner",    "value": {"party": $owner}},
      {"label": "amount",   "value": {"numeric": $amount}},
      {"label": "currency", "value": {"text": "EUR"}},
      {"label": "tokenId",  "value": {"text": $tokenId}}
    ]')

  RESPONSE=$(submit_create "$BANK_PARTY" "$BOB_PARTY" "Main" "SimpleToken" "$FIELDS")
  CID=$(extract_contract_id "$RESPONSE")
  EUR_TOKEN_IDS+=("$CID")
  log "    EUR $AMT token: $CID"
done

# --------------------------------------------------
# 5c: Alice transfers 1000 USD token to Bob
# --------------------------------------------------

log "  Alice transferring 1000 USD token to Bob..."

CHOICE_ARG=$(jq -n --arg newOwner "$BOB_PARTY" \
  '{"fields": [{"label": "newOwner", "value": {"party": $newOwner}}]}')

RESPONSE=$(submit_exercise "$ALICE_PARTY" "Main" "SimpleToken" "${USD_TOKEN_IDS[0]}" "Transfer" "$CHOICE_ARG")
TRANSFERRED_TOKEN=$(extract_contract_id "$RESPONSE")
log "    Transferred token: $TRANSFERRED_TOKEN"

# --------------------------------------------------
# 5d: Alice splits 500 USD token into 200 + 300
# --------------------------------------------------

log "  Alice splitting 500 USD token into 200 + 300..."

CHOICE_ARG=$(jq -n '{"fields": [{"label": "splitAmount", "value": {"numeric": "200.0"}}]}')

RESPONSE=$(submit_exercise "$ALICE_PARTY" "Main" "SimpleToken" "${USD_TOKEN_IDS[1]}" "Split" "$CHOICE_ARG")
SPLIT_IDS=($(extract_all_contract_ids "$RESPONSE"))
log "    Split results: ${SPLIT_IDS[0]:-none} and ${SPLIT_IDS[1]:-none}"

# --------------------------------------------------
# 5e: Bob transfers 1000 EUR token to Charlie
# --------------------------------------------------

log "  Bob transferring 1000 EUR token to Charlie..."

CHOICE_ARG=$(jq -n --arg newOwner "$CHARLIE_PARTY" \
  '{"fields": [{"label": "newOwner", "value": {"party": $newOwner}}]}')

RESPONSE=$(submit_exercise "$BOB_PARTY" "Main" "SimpleToken" "${EUR_TOKEN_IDS[1]}" "Transfer" "$CHOICE_ARG")
TRANSFERRED_EUR=$(extract_contract_id "$RESPONSE")
log "    Transferred EUR token: $TRANSFERRED_EUR"

# --------------------------------------------------
# 5f: Alice creates AgreementProposal to Bob
# --------------------------------------------------

log "  Creating agreement workflow..."
log "    Alice proposing agreement to Bob..."

FIELDS=$(jq -n \
  --arg proposer "$ALICE_PARTY" \
  --arg accepter "$BOB_PARTY" \
  '[
    {"label": "proposer",    "value": {"party": $proposer}},
    {"label": "accepter",    "value": {"party": $accepter}},
    {"label": "description", "value": {"text": "Token swap agreement"}},
    {"label": "value",       "value": {"numeric": "5000.0"}}
  ]')

RESPONSE=$(submit_create "$ALICE_PARTY" "$BOB_PARTY" "Main" "AgreementProposal" "$FIELDS")
PROPOSAL_CID=$(extract_contract_id "$RESPONSE")
log "    Proposal: $PROPOSAL_CID"

# --------------------------------------------------
# 5g: Bob accepts the proposal
# --------------------------------------------------

log "    Bob accepting proposal..."

CHOICE_ARG='{"fields": []}'

RESPONSE=$(submit_exercise "$BOB_PARTY" "Main" "AgreementProposal" "$PROPOSAL_CID" "Accept" "$CHOICE_ARG")
AGREEMENT_CID=$(extract_contract_id "$RESPONSE")
log "    Agreement: $AGREEMENT_CID"

# --------------------------------------------------
# 5h: Alice settles the agreement
# --------------------------------------------------

log "    Alice settling agreement..."

CHOICE_ARG='{"fields": []}'

RESPONSE=$(submit_exercise "$ALICE_PARTY" "Main" "Agreement" "$AGREEMENT_CID" "Settle" "$CHOICE_ARG")
SETTLED_CID=$(extract_contract_id "$RESPONSE")
log "    Settled agreement: $SETTLED_CID"

# --------------------------------------------------
# 5i: Alice creates 3 ReferenceData entries
# --------------------------------------------------

log "  Creating reference data..."

REF_DATA_IDS=()
REF_KEYS=("exchange-rate-usd-eur" "exchange-rate-usd-gbp" "market-status")
REF_VALUES=("0.92" "0.79" "open")

for i in "${!REF_KEYS[@]}"; do
  FIELDS=$(jq -n \
    --arg publisher "$ALICE_PARTY" \
    --arg dataKey "${REF_KEYS[$i]}" \
    --arg dataValue "${REF_VALUES[$i]}" \
    '[
      {"label": "publisher", "value": {"party": $publisher}},
      {"label": "dataKey",   "value": {"text": $dataKey}},
      {"label": "dataValue", "value": {"text": $dataValue}},
      {"label": "version",   "value": {"int64": "1"}}
    ]')

  RESPONSE=$(submit_create "$ALICE_PARTY" "" "Main" "ReferenceData" "$FIELDS")
  CID=$(extract_contract_id "$RESPONSE")
  REF_DATA_IDS+=("$CID")
  log "    ${REF_KEYS[$i]}: $CID"
done

# --------------------------------------------------
# 5j: Alice updates one ReferenceData entry
# --------------------------------------------------

log "  Updating reference data (exchange-rate-usd-eur)..."

CHOICE_ARG=$(jq -n '{"fields": [{"label": "newValue", "value": {"text": "0.94"}}]}')

RESPONSE=$(submit_exercise "$ALICE_PARTY" "Main" "ReferenceData" "${REF_DATA_IDS[0]}" "UpdateData" "$CHOICE_ARG")
UPDATED_REF=$(extract_contract_id "$RESPONSE")
log "    Updated: $UPDATED_REF"

# --------------------------------------------------
# 5k: Alice creates MultiPartyVisibility and exercises AliceBobAction
# --------------------------------------------------

log "  Creating multi-party visibility scenario..."

FIELDS=$(jq -n \
  --arg alice "$ALICE_PARTY" \
  --arg bob "$BOB_PARTY" \
  --arg charlie "$CHARLIE_PARTY" \
  '[
    {"label": "alice",      "value": {"party": $alice}},
    {"label": "bob",        "value": {"party": $bob}},
    {"label": "charlie",    "value": {"party": $charlie}},
    {"label": "secretData", "value": {"text": "classified-info-42"}}
  ]')

RESPONSE=$(submit_create "$ALICE_PARTY" "$BOB_PARTY" "Main" "MultiPartyVisibility" "$FIELDS")
MPV_CID=$(extract_contract_id "$RESPONSE")
log "    MultiPartyVisibility: $MPV_CID"

log "    Exercising AliceBobAction..."

CHOICE_ARG='{"fields": []}'

RESPONSE=$(submit_exercise "$ALICE_PARTY" "Main" "MultiPartyVisibility" "$MPV_CID" "AliceBobAction" "$CHOICE_ARG")
MPV_RESULTS=($(extract_all_contract_ids "$RESPONSE"))
log "    AliceOnly: ${MPV_RESULTS[0]:-none}, BobOnly: ${MPV_RESULTS[1]:-none}"

# --------------------------------------------------
# 5l: Alice creates 2 ContentionTarget contracts
# --------------------------------------------------

log "  Creating contention targets..."

CONTENTION_IDS=()
for VAL in 100 200; do
  FIELDS=$(jq -n \
    --arg owner "$ALICE_PARTY" \
    --arg value "$VAL" \
    '[
      {"label": "owner", "value": {"party": $owner}},
      {"label": "value", "value": {"int64": $value}}
    ]')

  RESPONSE=$(submit_create "$ALICE_PARTY" "" "Main" "ContentionTarget" "$FIELDS")
  CID=$(extract_contract_id "$RESPONSE")
  CONTENTION_IDS+=("$CID")
  log "    ContentionTarget($VAL): $CID"
done

# --------------------------------------------------
# 5m: Trigger expected failures for error testing
# --------------------------------------------------

log "  Triggering expected failures..."

# FailingTemplate with value=0 (ensure clause fails)
log "    Creating FailingTemplate with value=0 (should fail)..."

FIELDS=$(jq -n \
  --arg party "$ALICE_PARTY" \
  '[
    {"label": "party", "value": {"party": $party}},
    {"label": "value", "value": {"int64": "0"}}
  ]')

submit_create_expect_fail "$ALICE_PARTY" "Main" "FailingTemplate" "$FIELDS" "ensure value > 0"

# FailingTemplate with value=1, then exercise FailingChoice with divisor=0
log "    Creating FailingTemplate with value=1..."

FIELDS=$(jq -n \
  --arg party "$ALICE_PARTY" \
  '[
    {"label": "party", "value": {"party": $party}},
    {"label": "value", "value": {"int64": "1"}}
  ]')

RESPONSE=$(submit_create "$ALICE_PARTY" "" "Main" "FailingTemplate" "$FIELDS")
FAILING_CID=$(extract_contract_id "$RESPONSE")
log "      FailingTemplate: $FAILING_CID"

log "    Exercising FailingChoice with divisor=0 (should fail)..."

CHOICE_ARG='{"fields": [{"label": "divisor", "value": {"int64": "0"}}]}'

submit_exercise_expect_fail "$ALICE_PARTY" "Main" "FailingTemplate" "$FAILING_CID" "FailingChoice" "$CHOICE_ARG" "divisor must not be zero"

# ============================================================
# Summary
# ============================================================

log ""
log "============================================"
log "  Demo seed complete!"
log "  Parties:   4 (Alice, Bob, Charlie, Bank)"
log "  Contracts: $CONTRACTS_CREATED created"
log "  Exercises: $EXERCISES_DONE executed"
log "  Errors:    $ERRORS_TRIGGERED triggered (expected)"
log "============================================"
log ""
