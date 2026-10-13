#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf public
mkdir -p public
cp index.html manifest.json sw.js public/
cp -R assets js public/
echo "PWA preparado em public/."
