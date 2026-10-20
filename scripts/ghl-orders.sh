#!/usr/bin/env bash
# Read-only: pull every order's detail (items, addresses) and every contact from GHL into discovery/ghl/.
set -uo pipefail
cd "$(dirname "$0")/.."
source .env
LOC=k99WWlO7oYFG9xusH0XF
API=https://services.leadconnectorhq.com
H=(-H "Authorization: Bearer $GHL_TOKEN" -H "Version: 2021-07-28" -H "Accept: application/json")
mkdir -p discovery/ghl/orders

for id in $(python3 -I -c "import json;[print(o['_id']) for o in json.load(open('discovery/ghl/orders.json'))['data']]"); do
  curl -s "${H[@]}" "$API/payments/orders/$id?altId=$LOC&altType=location" -o "discovery/ghl/orders/$id.json"
done
echo "orders: $(ls discovery/ghl/orders | wc -l)"

# Contacts: page through with startAfterId / startAfter.
python3 -I - "$GHL_TOKEN" "$LOC" <<'EOF'
import json, sys, urllib.request
token, loc = sys.argv[1], sys.argv[2]
out, after_id, after = [], None, None
while True:
    url = f"https://services.leadconnectorhq.com/contacts/?locationId={loc}&limit=100"
    if after_id: url += f"&startAfterId={after_id}&startAfter={after}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Version": "2021-07-28", "Accept": "application/json", "User-Agent": "bbc-import"})
    page = json.load(urllib.request.urlopen(req))
    out += page.get("contacts", [])
    meta = page.get("meta", {})
    if not page.get("contacts") or not meta.get("startAfterId") or len(out) >= meta.get("total", 0): break
    after_id, after = meta["startAfterId"], meta["startAfter"]
json.dump(out, open("discovery/ghl/contacts_all.json", "w"))
print("contacts:", len(out))
EOF
