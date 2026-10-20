#!/usr/bin/env bash
# Read-only: pull each product's detail and prices from GHL into discovery/ghl/products/.
set -uo pipefail
cd "$(dirname "$0")/.."
source .env
LOC=k99WWlO7oYFG9xusH0XF
API=https://services.leadconnectorhq.com
OUT=discovery/ghl/products
mkdir -p "$OUT"
H=(-H "Authorization: Bearer $GHL_TOKEN" -H "Version: 2021-07-28" -H "Accept: application/json")

for id in $(python3 -I -c "import json;[print(p['_id']) for p in json.load(open('discovery/ghl/products.json'))['products']]"); do
  curl -s "${H[@]}" "$API/products/$id?locationId=$LOC" -o "$OUT/$id.json"
  curl -s "${H[@]}" "$API/products/$id/price?locationId=$LOC&limit=100" -o "$OUT/$id.prices.json"
done
ls "$OUT" | wc -l
