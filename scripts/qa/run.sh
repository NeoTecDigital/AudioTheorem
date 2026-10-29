#!/bin/sh
set -eu
# Production dependencies only; no implicit offline substitutions.
cargo test --locked
cargo test --locked --no-default-features
cargo clippy --locked --lib --bin nova-daw -- -D warnings
node tests/browser-controls.mjs
python3 scripts/qa/limits.py
NOVA_TEST_FLAGS='-O2 -Werror' nova_bridge/tests/run.sh
cargo test --locked --release --test realtime callback_budget_reference -- --ignored --nocapture
printf '%s\n' 'Software gates passed. Hardware soak, live browser and explicit visual acceptance are still required.'
