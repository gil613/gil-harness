#!/bin/bash
set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-$(pwd)}"

mkdir -p "$TARGET_DIR/.harness/agents"
mkdir -p "$TARGET_DIR/.harness/commands"

cp -r "$PLUGIN_DIR/agents/." "$TARGET_DIR/.harness/agents/"
cp -r "$PLUGIN_DIR/commands/." "$TARGET_DIR/.harness/commands/"

echo "harness installed → $TARGET_DIR/.harness"
