#!/usr/bin/env bash
# Builds whisper.cpp (with whisper-server) at a pinned tag and downloads the models.
# Idempotent: running it again skips what is already in place.
set -euo pipefail

WHISPER_TAG="v1.9.5"
MODELS=("large-v3-turbo" "large-v3")
VAD_MODEL="silero-v6.2.0"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor/whisper.cpp"
MODELS_DIR="$ROOT/models"

fail() { echo "setup-engine: $*" >&2; exit 1; }

for tool in git cmake ffmpeg; do
  command -v "$tool" >/dev/null || fail "'$tool' is not installed. Install it with: brew install $tool"
done
xcode-select -p >/dev/null 2>&1 || fail "Xcode command line tools are missing. Install them with: xcode-select --install"

# 1. Pinned checkout
if [ ! -d "$VENDOR/.git" ]; then
  echo "Cloning whisper.cpp $WHISPER_TAG..."
  git clone --quiet --depth 1 --branch "$WHISPER_TAG" https://github.com/ggml-org/whisper.cpp.git "$VENDOR" \
    || fail "could not clone whisper.cpp $WHISPER_TAG"
fi
actual_tag="$(git -C "$VENDOR" describe --tags --exact-match 2>/dev/null || true)"
[ "$actual_tag" = "$WHISPER_TAG" ] || fail "vendor/whisper.cpp is at '${actual_tag:-unknown}', expected $WHISPER_TAG. Delete vendor/ and run again."

# 2. Build with the server, Metal, no Core ML
SERVER_BIN="$VENDOR/build/bin/whisper-server"
if [ ! -x "$SERVER_BIN" ]; then
  echo "Building whisper.cpp..."
  cmake -S "$VENDOR" -B "$VENDOR/build" -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_BUILD_SERVER=ON -DWHISPER_BUILD_EXAMPLES=ON -DGGML_METAL=ON -DWHISPER_COREML=OFF >/dev/null \
    || fail "cmake configure failed"
  cmake --build "$VENDOR/build" --config Release -j --target whisper-server \
    || fail "build failed"
fi
[ -x "$SERVER_BIN" ] || fail "whisper-server was not built"

# 3. Models
mkdir -p "$MODELS_DIR"
for model in "${MODELS[@]}"; do
  if [ ! -s "$MODELS_DIR/ggml-$model.bin" ]; then
    echo "Downloading ggml-$model.bin..."
    bash "$VENDOR/models/download-ggml-model.sh" "$model" "$MODELS_DIR" || fail "could not download model $model"
  fi
  [ -s "$MODELS_DIR/ggml-$model.bin" ] || fail "model file ggml-$model.bin is missing after download"
done

if [ ! -s "$MODELS_DIR/ggml-$VAD_MODEL.bin" ]; then
  echo "Downloading VAD model ggml-$VAD_MODEL.bin..."
  bash "$VENDOR/models/download-vad-model.sh" "$VAD_MODEL" "$MODELS_DIR" || fail "could not download VAD model"
fi
[ -s "$MODELS_DIR/ggml-$VAD_MODEL.bin" ] || fail "VAD model file is missing after download"

echo "Engine ready: $SERVER_BIN"
