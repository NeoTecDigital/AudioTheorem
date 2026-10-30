#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
out=${NOVA_TEST_OUT:-/tmp/nova-native-qa}
mkdir -p "$out"
glslc "$root/nova_bridge/shaders/scene.vert" -o "$out/vert.spv"
glslc "$root/nova_bridge/shaders/scene.frag" -o "$out/frag.spv"
glslc "$root/nova_bridge/shaders/stroke.vert" -o "$out/stroke.vert.spv"
glslc "$root/nova_bridge/shaders/stroke.frag" -o "$out/stroke.frag.spv"
python3 - "$out" "$root" <<'PY'
import pathlib, struct, sys
out = pathlib.Path(sys.argv[1])
header = '#pragma once\n#include <cstdint>\n'
for stage, name in [('vert', 'vertex'), ('frag', 'fragment'), ('stroke.vert', 'stroke_vertex'), ('stroke.frag', 'stroke_fragment')]:
    blob = (out / (stage + '.spv')).read_bytes()
    words = struct.unpack('<' + 'I' * (len(blob) // 4), blob)
    header += 'inline constexpr uint32_t nova_' + name + '_shader[] = {' + ','.join(map(str, words)) + '};\n'
(out / 'nova_shaders.h').write_text(header)
logo = (pathlib.Path(sys.argv[2]) / 'assets/audio-theorem/icon.png').read_bytes()
(out / 'nova_artwork.h').write_text('#pragma once\ninline constexpr unsigned char nova_artwork[] = {' + ','.join(map(str,logo)) + '};\n')
PY
${CXX:-c++} -std=c++20 -Wall -Wextra -Wno-missing-field-initializers \
  ${NOVA_TEST_FLAGS:--O2} -I "$out" "$root/extern/Nova/Nova.cpp" \
  "$root"/extern/Nova/Scene/*.cpp "$root/nova_bridge/nova_visualizer.cpp" \
  "$root/nova_bridge/tests/native.cpp" -lSDL2 -lSDL2_image -lvulkan -pthread -o "$out/native-tests"
"$out/native-tests" "$@"
