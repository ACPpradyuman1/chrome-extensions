#!/usr/bin/env bash
# KindleFlow Extension Native Host Installer
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Detect OS and set NativeMessagingHosts directory
if [[ "$OSTYPE" == "darwin"* ]]; then
  TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
else
  TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi

echo "Installing KindleFlow Native Messaging Host..."
mkdir -p "$TARGET_DIR"

# Ensure host script is executable
chmod +x "$DIR/native_host.py"

# Write manifest
MANIFEST="$TARGET_DIR/com.kindleflow.host.json"
cat <<EOF > "$MANIFEST"
{
  "name": "com.kindleflow.host",
  "description": "KindleFlow Native Messaging Host",
  "path": "$DIR/native_host.py",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://caonpbhbkpngfnfjleigonphfobjbkil/"
  ]
}
EOF

echo "✅ Host registered at: $MANIFEST"
echo "✅ Target script: $DIR/native_host.py"
echo "Ready to use in Google Chrome!"
