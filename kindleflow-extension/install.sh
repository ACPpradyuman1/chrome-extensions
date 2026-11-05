#!/usr/bin/env bash
# KindleFlow 1-Click Native Host Installer
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "=== KindleFlow Setup ==="

# 1. Verify Python 3
if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: Python 3 is required but not found."
    echo "Please install Python 3 (https://www.python.org/) and re-run this script."
    exit 1
fi

# 2. Check and install Python dependencies
echo "Checking Python dependencies..."
if python3 -c "import ebooklib, PIL, markdown, lxml" >/dev/null 2>&1; then
    echo "Python dependencies already satisfied."
else
    echo "Installing required dependencies..."
    if python3 -m venv "$DIR/.venv" >/dev/null 2>&1; then
        echo "Created isolated environment in .venv"
        "$DIR/.venv/bin/pip" install -q -r "$DIR/requirements.txt"
    else
        # Fallback to pip3 user install if venv module is unavailable
        pip3 install --quiet --user -r "$DIR/requirements.txt" || pip3 install --quiet -r "$DIR/requirements.txt"
    fi
fi

# 3. Ensure executable permissions
chmod +x "$DIR/run_host.sh"
chmod +x "$DIR/native_host.py"

# 4. Target Browser Native Messaging Directories
TARGET_DIRS=()
if [[ "$OSTYPE" == "darwin"* ]]; then
    TARGET_DIRS=(
        "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
        "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
        "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
        "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
        "$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts"
        "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"
    )
else
    TARGET_DIRS=(
        "$HOME/.config/google-chrome/NativeMessagingHosts"
        "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
        "$HOME/.config/microsoft-edge/NativeMessagingHosts"
        "$HOME/.config/chromium/NativeMessagingHosts"
    )
fi

REGISTERED_COUNT=0
for TARGET_DIR in "${TARGET_DIRS[@]}"; do
    PARENT_DIR="$(dirname "$TARGET_DIR")"
    # Register if parent browser directory exists, or default to Google Chrome
    if [ -d "$PARENT_DIR" ] || [[ "$TARGET_DIR" == *"Google/Chrome"* ]] || [[ "$TARGET_DIR" == *"google-chrome"* ]]; then
        mkdir -p "$TARGET_DIR"
        MANIFEST="$TARGET_DIR/com.kindleflow.host.json"
        cat <<EOF > "$MANIFEST"
{
  "name": "com.kindleflow.host",
  "description": "KindleFlow Native Messaging Host",
  "path": "$DIR/run_host.sh",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://caonpbhbkpngfnfjleigonphfobjbkil/"
  ]
}
EOF
        REGISTERED_COUNT=$((REGISTERED_COUNT + 1))
    fi
done

echo "Registered Native Messaging Host across $REGISTERED_COUNT browser directory(ies)."

# 5. Copy extension directory path to clipboard for effortless pasting in Chrome
if command -v pbcopy >/dev/null 2>&1; then
    printf "%s" "$DIR" | pbcopy
    COPIED_NOTE=" (path copied to clipboard)"
elif command -v xclip >/dev/null 2>&1; then
    printf "%s" "$DIR" | xclip -selection clipboard
    COPIED_NOTE=" (path copied to clipboard)"
else
    COPIED_NOTE=""
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next step (load into Chrome):"
echo "1. Navigate to: chrome://extensions"
echo "2. Enable 'Developer mode' (toggle in top right)"
echo "3. Click 'Load unpacked' and select:"
echo "   $DIR$COPIED_NOTE"
echo ""
