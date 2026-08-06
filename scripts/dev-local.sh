#!/usr/bin/env sh
set -eu

OCR_COMMAND="local-ocr/.venv/bin/uvicorn"

if [ ! -x "$OCR_COMMAND" ]; then
  echo "Local OCR is not installed. Run: python3 -m venv local-ocr/.venv && local-ocr/.venv/bin/pip install -r local-ocr/requirements.txt"
  exit 1
fi

"$OCR_COMMAND" mou_ocr_service:app --app-dir local-ocr --host 127.0.0.1 --port 8000 &
OCR_PID=$!

cleanup() {
  kill "$OCR_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM
npm run dev
