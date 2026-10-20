#!/usr/bin/env bash
# Read-only inventory of the Beaded by Char GHL sub-account. Writes JSON to discovery/ghl/.
set -uo pipefail
cd "$(dirname "$0")/.."
source .env
LOC=k99WWlO7oYFG9xusH0XF
API=https://services.leadconnectorhq.com
OUT=discovery/ghl
mkdir -p "$OUT"

get() { # name path
  local code
  code=$(curl -s -o "$OUT/$1.json" -w "%{http_code}" "$API$2" \
    -H "Authorization: Bearer $GHL_TOKEN" -H "Version: 2021-07-28" -H "Accept: application/json")
  printf '%-22s %s  %s bytes\n' "$1" "$code" "$(wc -c < "$OUT/$1.json" | tr -d ' ')"
}

get location        "/locations/$LOC"
get products        "/products/?locationId=$LOC&limit=100"
get collections     "/products/collections?altId=$LOC&altType=location&limit=100"
get orders          "/payments/orders?altId=$LOC&altType=location&limit=100"
get transactions    "/payments/transactions?altId=$LOC&altType=location&limit=100"
get subscriptions   "/payments/subscriptions?altId=$LOC&altType=location&limit=100"
get coupons         "/payments/coupon/list?altId=$LOC&altType=location&limit=100"
get shipping_zones  "/store/shipping-zone?altId=$LOC&altType=location&withShippingRate=true"
get shipping_carrier "/store/shipping-carrier?altId=$LOC&altType=location"
get store_setting   "/store/store-setting?altId=$LOC&altType=location"
get invoices        "/invoices/?altId=$LOC&altType=location&limit=100&offset=0"
get invoice_tmpls   "/invoices/template?altId=$LOC&altType=location&limit=100&offset=0"
get workflows       "/workflows/?locationId=$LOC"
get funnels         "/funnels/funnel/list?locationId=$LOC&limit=50"
get forms           "/forms/?locationId=$LOC&limit=50"
get contacts        "/contacts/?locationId=$LOC&limit=100"
get media           "/medias/files?altId=$LOC&altType=location&sortBy=createdAt&sortOrder=desc&limit=100"
get custom_fields   "/locations/$LOC/customFields"
get custom_values   "/locations/$LOC/customValues"
get tags            "/locations/$LOC/tags"
get users           "/users/?locationId=$LOC"
get email_templates "/emails/builder?locationId=$LOC&limit=50"
