#!/usr/bin/env python3
"""Conservative Rust owned-code line gate; archive/vendor/legacy are excluded explicitly."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PATHS = ['src/audio', 'src/runtime', 'src/analysis', 'src/server', 'src/visualizer', 'src/native_input', 'src/contracts', 'tests']
FILES = ['src/contracts.rs', 'src/runtime.rs', 'src/main.rs', 'src/lib.rs', 'build.rs']


def mask(source):
    pattern = r'//[^\n]*|/\*[\s\S]*?\*/|r(#+)"[\s\S]*?"\1|"(?:\\.|[^"\\])*"'
    return re.sub(pattern, lambda m: ''.join('\n' if c == '\n' else ' ' for c in m[0]), source)


def functions(source):
    clean = mask(source)
    for match in re.finditer(r'\bfn\s+(\w+)\s*(?:<[^{};]*>)?\s*\(', clean):
        start = clean.find('{', match.end())
        if start < 0:
            continue
        depth, end = 1, start + 1
        while depth and end < len(clean):
            depth += (clean[end] == '{') - (clean[end] == '}')
            end += 1
        yield match[1], clean.count('\n', 0, match.start()) + 1, clean[match.start():end].count('\n') + 1


def main():
    paths = [ROOT / name for name in FILES]
    paths += [p for folder in PATHS for p in (ROOT / folder).rglob('*.rs')]
    failures = []
    for path in sorted(set(paths)):
        source = path.read_text()
        if len(source.splitlines()) > 500:
            failures.append(f'{path.relative_to(ROOT)}: file exceeds 500 lines')
        for name, line, length in functions(source):
            if length > 50:
                failures.append(f'{path.relative_to(ROOT)}:{line} {name}: {length} > 50 lines')
    print('\n'.join(failures) if failures else 'Owned Rust line gates pass')
    return bool(failures)


if __name__ == '__main__':
    sys.exit(main())
