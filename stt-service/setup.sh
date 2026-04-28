#!/usr/bin/env bash
set -euo pipefail

python3 -m venv whisper-env
source whisper-env/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "Done. Run: source whisper-env/bin/activate"
