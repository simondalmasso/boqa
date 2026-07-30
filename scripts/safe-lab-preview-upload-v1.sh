#!/usr/bin/env bash
set -Eeuo pipefail
set +x

: "${CLOUDFLARE_ACCOUNT_ID:?missing account id}"
: "${CLOUDFLARE_API_TOKEN:?missing api token}"
: "${BOQA_HEAD_SHA:?missing exact head sha}"
: "${BOQA_BUNDLE_DIR:?missing exact bundle directory}"
: "${BOQA_OUTPUT_DIR:?missing output directory}"

WORKER_NAME="${WORKER_NAME:-boqa}"
WRANGLER_VERSION="${WRANGLER_VERSION:-4.112.0}"
API="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}"
AUTH=(-H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")
OUT="$(realpath -m "$BOQA_OUTPUT_DIR")"
BUNDLE="$(realpath "$BOQA_BUNDLE_DIR")"
mkdir -p "$OUT"

test -f "$BUNDLE/SHA256SUMS"
test ! -e "$BUNDLE/.dev.vars"
test ! -e "$BUNDLE/.env"
forbidden_flag="--keep""-vars"
! grep -R -n -- "$forbidden_flag" "$BUNDLE"
! grep -R -n -E 'BOQA_BACKEND_URL|BOQA_API_KEY|BOQA_HMAC_SECRET|account_id\s*=' "$BUNDLE/wrangler.toml"

curl -fsS "${AUTH[@]}" "$API/workers/scripts/${WORKER_NAME}/deployments" > /tmp/boqa-deployments-before.json
curl -fsS "${AUTH[@]}" "$API/workers/workers/${WORKER_NAME}/versions?per_page=100" > /tmp/boqa-versions-before.json
jq -S '{active:(.result.deployments[0] | {id,created_on,source,strategy,versions})}' /tmp/boqa-deployments-before.json > "$OUT/deployment-before.json"
jq -r '.result[]?.id' /tmp/boqa-versions-before.json | sort -u > /tmp/boqa-version-ids-before.txt

message="safe-lab-preview:${BOQA_HEAD_SHA}"
(
  cd "$BUNDLE"
  WRANGLER_SEND_METRICS=false npx --yes "wrangler@${WRANGLER_VERSION}" versions upload --message "$message"
) 2>&1 | tee "$OUT/wrangler-version-upload.log"

version_id=$(grep -Eo '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' "$OUT/wrangler-version-upload.log" | tail -1 || true)
preview_url=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.workers\.dev' "$OUT/wrangler-version-upload.log" | tail -1 || true)
test -n "$version_id"

curl -fsS "${AUTH[@]}" "$API/workers/workers/${WORKER_NAME}/versions?per_page=100" > /tmp/boqa-versions-after.json
jq -r '.result[]?.id' /tmp/boqa-versions-after.json | sort -u > /tmp/boqa-version-ids-after.txt
comm -13 /tmp/boqa-version-ids-before.txt /tmp/boqa-version-ids-after.txt > /tmp/boqa-new-version-ids.txt
grep -Fx "$version_id" /tmp/boqa-new-version-ids.txt >/dev/null

curl -fsS "${AUTH[@]}" "$API/workers/scripts/${WORKER_NAME}/versions/${version_id}" > /tmp/boqa-version-script-detail.json
curl -fsS "${AUTH[@]}" "$API/workers/workers/${WORKER_NAME}/versions/${version_id}" > /tmp/boqa-version-beta-detail.json
jq -e --arg id "$version_id" '.success == true and .result.id == $id' /tmp/boqa-version-script-detail.json >/dev/null
jq -e --arg id "$version_id" '.success == true and .result.id == $id' /tmp/boqa-version-beta-detail.json >/dev/null

jq -e '
  (.result.resources.bindings // []) as $bindings |
  ($bindings | length) == 1 and
  ($bindings[0].name == "ASSETS") and
  ($bindings[0].type == "assets") and
  ([ $bindings[] | select(.type != "assets" or .name != "ASSETS") ] | length) == 0
' /tmp/boqa-version-script-detail.json >/dev/null

binding_names=$(jq -c '[.result.resources.bindings[]? | {name,type}]' /tmp/boqa-version-script-detail.json)
test "$binding_names" = '[{"name":"ASSETS","type":"assets"}]'

if [ -z "$preview_url" ]; then
  preview_url=$(jq -r '.result.urls[]? | select(test("^https://.*\\.workers\\.dev/?$"))' /tmp/boqa-version-beta-detail.json | head -1)
fi
preview_url="${preview_url%/}"
test -n "$preview_url"
jq -e --arg url "$preview_url" '.result.urls | index($url) != null or index($url + "/") != null' /tmp/boqa-version-beta-detail.json >/dev/null

curl -fsS "${AUTH[@]}" "$API/workers/scripts/${WORKER_NAME}/deployments" > /tmp/boqa-deployments-after.json
jq -S '{active:(.result.deployments[0] | {id,created_on,source,strategy,versions})}' /tmp/boqa-deployments-after.json > "$OUT/deployment-after.json"
cmp "$OUT/deployment-before.json" "$OUT/deployment-after.json"

jq -e --arg id "$version_id" '[.active.versions[]? | select(.version_id == $id or .id == $id)] | length == 0' "$OUT/deployment-after.json" >/dev/null
stable_traffic=$(jq '[.active.versions[]?.percentage // 0] | add // 100' "$OUT/deployment-after.json")
test "$stable_traffic" = "100"

jq '{success,result:{id:.result.id,number:.result.number,metadata:.result.metadata,bindings:[.result.resources.bindings[]? | {name,type}]}}' /tmp/boqa-version-script-detail.json > "$OUT/version-detail.json"
jq '{success,result:{id:.result.id,created_on:.result.created_on,number:.result.number,urls:.result.urls,annotations:.result.annotations,bindings:[.result.bindings[]? | {name,type}]}}' /tmp/boqa-version-beta-detail.json > "$OUT/version-beta-detail.json"
jq -n \
  --arg version_id "$version_id" \
  --arg preview_url "$preview_url" \
  --arg source_sha "$BOQA_HEAD_SHA" \
  --argjson bindings "$binding_names" \
  '{schema_version:1,version_id:$version_id,preview_url:$preview_url,source_sha:$source_sha,bindings:$bindings,candidate_traffic_percentage:0,stable_traffic_percentage:100,production_changed:false,deploy_performed:false,promotion_ready:false,promotion_blocker:"CONTROLLED_LAB_PREVIEW"}' \
  > "$OUT/worker-version.json"

{
  echo "BOQA_VERSION_ID=$version_id"
  echo "BOQA_PREVIEW_URL=$preview_url"
} >> "${GITHUB_ENV:?missing GITHUB_ENV}"
