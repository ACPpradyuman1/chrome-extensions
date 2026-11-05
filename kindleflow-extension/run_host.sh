#!/usr/bin/env bash
# KindleFlow Native Host Launcher
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

if [ -f "$DIR/.venv/bin/python3" ]; then
    exec "$DIR/.venv/bin/python3" "$DIR/native_host.py" "$@"
elif [ -f "$DIR/.venv/bin/python" ]; then
    exec "$DIR/.venv/bin/python" "$DIR/native_host.py" "$@"
else
    exec python3 "$DIR/native_host.py" "$@"
fi
