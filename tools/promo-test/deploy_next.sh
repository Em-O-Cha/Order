#!/bin/bash
# deploy Edge Function ขึ้น Supabase: ./deploy_next.sh <slug> <โฟลเดอร์ที่มี index.ts + gas_port.js>
# ทดสอบให้ใช้ slug ลงท้าย -next (เช่น shop-read-next) แล้วลบทิ้งหลังเทียบผล:
#   curl -X DELETE https://api.supabase.com/v1/projects/<ref>/functions/<slug>
set -e
SLUG=$1; SRC=$(cd "$2" && pwd); HERE=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HERE/../.." && pwd)
TMP=$(mktemp -d); mkdir -p "$TMP/$SLUG" "$TMP/_shared"
cp "$SRC/index.ts" "$SRC/gas_port.js" "$TMP/$SLUG/" && cp "$REPO"/supabase/functions/_shared/* "$TMP/_shared/"
cd "$TMP"
curl -sS -X POST "https://api.supabase.com/v1/projects/qotlepudmkuniyjvqmle/functions/deploy?slug=$SLUG" \
 -F "metadata={\"entrypoint_path\":\"$SLUG/index.ts\",\"name\":\"$SLUG\",\"verify_jwt\":false};type=application/json" \
 -F "file=@$SLUG/index.ts;filename=$SLUG/index.ts" -F "file=@$SLUG/gas_port.js;filename=$SLUG/gas_port.js" \
 -F "file=@_shared/gas_runtime.js;filename=_shared/gas_runtime.js" -F "file=@_shared/mirror_client.ts;filename=_shared/mirror_client.ts" | head -c 200; echo
rm -rf "$TMP"
