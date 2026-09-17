#!/usr/bin/env bash
set -euo pipefail

: "${API_URL:?API_URL is required}"
: "${ANON_KEY:?ANON_KEY is required}"
: "${DB_URL:?DB_URL is required}"

TENANT_ID="11111111-1111-4111-8111-111111111111"
WORKSPACE_ID="11111111-1111-4111-8111-111111111112"
EMAIL="handoff-lab@frotak.local"
PASSWORD="FrotakLab!2026"
FUNCTION_URL="${API_URL}/functions/v1/client-handoff"

json_value() {
  node -e 'const fs=require("fs"); const obj=JSON.parse(fs.readFileSync(0,"utf8")); const path=process.argv[1].split("."); let value=obj; for (const key of path) value=value?.[key]; if (value === undefined || value === null) process.exit(2); process.stdout.write(String(value));' "$1"
}

echo "Creating synthetic auth user in local-only FROTAK LAB..."
SIGNUP_RESPONSE="$({
  curl --silent --show-error --fail \
    --request POST "${API_URL}/auth/v1/signup" \
    --header "apikey: ${ANON_KEY}" \
    --header "Content-Type: application/json" \
    --data "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"data\":{\"full_name\":\"Handoff Laboratorio\"}}"
} )"

ACCESS_TOKEN="$(printf '%s' "${SIGNUP_RESPONSE}" | json_value access_token)"
USER_ID="$(printf '%s' "${SIGNUP_RESPONSE}" | json_value user.id)"

psql "${DB_URL}" --set=ON_ERROR_STOP=1 --set=user_id="${USER_ID}" <<'SQL'
insert into public.workspace_memberships (
  workspace_id,
  user_id,
  status,
  is_owner,
  joined_at
) values (
  '11111111-1111-4111-8111-111111111112'::uuid,
  :'user_id'::uuid,
  'active',
  true,
  now()
)
on conflict (workspace_id, user_id)
do update set status = 'active', is_owner = true, joined_at = coalesce(public.workspace_memberships.joined_at, now());
SQL

echo "Rejecting create without authenticated user..."
UNAUTH_STATUS="$({
  curl --silent --output /tmp/handoff-unauth.json --write-out '%{http_code}' \
    --request POST "${FUNCTION_URL}" \
    --header "apikey: ${ANON_KEY}" \
    --header "Content-Type: application/json" \
    --data "{\"action\":\"create\",\"tenantId\":\"${TENANT_ID}\"}"
} )"
test "${UNAUTH_STATUS}" = "401"

echo "Creating one-time handoff ticket..."
CREATE_RESPONSE="$({
  curl --silent --show-error --fail \
    --request POST "${FUNCTION_URL}" \
    --header "apikey: ${ANON_KEY}" \
    --header "Authorization: Bearer ${ACCESS_TOKEN}" \
    --header "Content-Type: application/json" \
    --data "{\"action\":\"create\",\"tenantId\":\"${TENANT_ID}\"}"
} )"

CODE="$(printf '%s' "${CREATE_RESPONSE}" | json_value code)"
RETURNED_TENANT="$(printf '%s' "${CREATE_RESPONSE}" | json_value tenantId)"
RETURNED_WORKSPACE="$(printf '%s' "${CREATE_RESPONSE}" | json_value workspaceId)"

test "${RETURNED_TENANT}" = "${TENANT_ID}"
test "${RETURNED_WORKSPACE}" = "${WORKSPACE_ID}"
test "${#CODE}" -ge 40

if printf '%s' "${CREATE_RESPONSE}" | grep -Eqi 'access_token|refresh_token'; then
  echo "Handoff create response leaked a Supabase session token." >&2
  exit 1
fi

STORED_HASH="$(psql "${DB_URL}" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command "select code_hash from public.auth_handoff_codes where user_id='${USER_ID}'::uuid order by created_at desc limit 1;")"
test "${#STORED_HASH}" = "64"
if [[ "${STORED_HASH}" == "${CODE}" ]]; then
  echo "Raw handoff code was stored instead of SHA-256." >&2
  exit 1
fi

echo "Exchanging ticket once..."
EXCHANGE_RESPONSE="$({
  curl --silent --show-error --fail \
    --request POST "${FUNCTION_URL}" \
    --header "apikey: ${ANON_KEY}" \
    --header "Content-Type: application/json" \
    --data "{\"action\":\"exchange\",\"code\":\"${CODE}\"}"
} )"

TOKEN_HASH="$(printf '%s' "${EXCHANGE_RESPONSE}" | json_value tokenHash)"
VERIFY_TYPE="$(printf '%s' "${EXCHANGE_RESPONSE}" | json_value verificationType)"
test -n "${TOKEN_HASH}"
test "${VERIFY_TYPE}" = "magiclink"

CONSUMED_COUNT="$(psql "${DB_URL}" --tuples-only --no-align --set=ON_ERROR_STOP=1 --command "select count(*) from public.auth_handoff_codes where user_id='${USER_ID}'::uuid and consumed_at is not null;")"
test "${CONSUMED_COUNT}" = "1"

echo "Rejecting replay of the same ticket..."
REPLAY_STATUS="$({
  curl --silent --output /tmp/handoff-replay.json --write-out '%{http_code}' \
    --request POST "${FUNCTION_URL}" \
    --header "apikey: ${ANON_KEY}" \
    --header "Content-Type: application/json" \
    --data "{\"action\":\"exchange\",\"code\":\"${CODE}\"}"
} )"
test "${REPLAY_STATUS}" = "401"

echo "Verifying generated Supabase token hash produces a real local session..."
VERIFY_RESPONSE="$({
  curl --silent --show-error --fail \
    --request POST "${API_URL}/auth/v1/verify" \
    --header "apikey: ${ANON_KEY}" \
    --header "Content-Type: application/json" \
    --data "{\"type\":\"magiclink\",\"token_hash\":\"${TOKEN_HASH}\"}"
} )"

VERIFIED_USER_ID="$(printf '%s' "${VERIFY_RESPONSE}" | json_value user.id)"
VERIFIED_ACCESS_TOKEN="$(printf '%s' "${VERIFY_RESPONSE}" | json_value access_token)"
test "${VERIFIED_USER_ID}" = "${USER_ID}"
test -n "${VERIFIED_ACCESS_TOKEN}"

echo "Wave 0 client handoff E2E: PASS"
