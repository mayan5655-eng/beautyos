#!/bin/sh
# Renders welcome-image.html to public/media/kalmea-welcome-whatsapp.png (1080x1080) with headless Edge.
cd "$(dirname "$0")"
OUT="$(cd ../../public/media && pwd -W 2>/dev/null || pwd)/kalmea-welcome-whatsapp.png"
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1080,1080 --virtual-time-budget=8000 \
  --screenshot="$OUT" "file:///$(pwd -W)/welcome-image.html"
