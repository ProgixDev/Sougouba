#!/bin/bash
# tap.sh <deviceX> <deviceY> [shotName] [settleSeconds]
# Coordinates are iPhone 17 Pro device points (402 x 874).
set -e
# Override for another device: UDID=… DEVICE_WIDTH=… ./scripts/tap.sh …
UDID="${UDID:-$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; print(next(x["udid"] for v in d.values() for x in v))')}"
DEVICE_WIDTH="${DEVICE_WIDTH:-402}"   # iPhone 17 Pro, in points
DIR="$(cd "$(dirname "$0")" && pwd)"

read -r GX GY GW GH WX WY < <(osascript -l JavaScript "$DIR/geom.js")
SCALE=$(echo "$GW / $DEVICE_WIDTH" | bc -l)

# macOS swallows the first click into a non-key window, so spend one warm-up
# click. Where it lands has twice cost the device window, which cannot then be
# reopened (System Events reports zero windows forever after; recovery is
# `simctl shutdown all`, quit Simulator, `simctl boot`, `open -a Simulator`):
#   - the title bar's LEFT end is the traffic lights — it closes the window;
#   - below the device screen can fall outside the window onto the Dock,
#     depending on where the window happens to sit.
# The title bar's horizontal CENTRE is inside the window and hits no control.
osascript -l JavaScript "$DIR/click.js" "$(echo "$GX + $GW / 2" | bc -l)" "$(echo "$WY + 8" | bc -l)" >/dev/null
sleep 0.25

SX=$(echo "$GX + $1 * $SCALE" | bc -l)
SY=$(echo "$GY + $2 * $SCALE" | bc -l)
osascript -l JavaScript "$DIR/click.js" "$SX" "$SY" >/dev/null

sleep "${4:-1.5}"
NAME="${3:-shot}"
xcrun simctl io "$UDID" screenshot "$DIR/$NAME.png" >/dev/null 2>&1
sips -Z 900 "$DIR/$NAME.png" >/dev/null
echo "$NAME.png"
