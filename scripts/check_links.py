#!/usr/bin/env python3
"""Validate every relative markdown link target and #anchor. Exit 1 on any failure."""
import pathlib, re, sys

slug = lambda h: re.sub(r'[^a-z0-9 -]', '', h.strip().lower()).replace(' ', '-')

def anchors(path):
    out = set()
    for line in path.read_text().splitlines():
        m = re.match(r'#{1,6}\s+(.*)', line)
        if m:
            out.add(slug(m.group(1)))
    return out

bad = 0
ignored_directories = {'.git', '.next', '.turbo', 'coverage', 'dist', 'node_modules'}

for src in sorted(pathlib.Path('.').rglob('*.md')):
    if ignored_directories.intersection(src.parts):
        continue
    for link in re.findall(r'\]\(([^)\s]+)\)', src.read_text()):
        if re.match(r'^(https?:|mailto:|tel:)', link):
            continue
        path, _, frag = link.partition('#')
        tgt = (src.parent / path) if path else src
        if not tgt.exists():
            print(f'  FAIL {src} -> {link} (missing file)'); bad = 1; continue
        if frag and tgt.suffix == '.md' and frag.lower() not in anchors(tgt):
            print(f'  FAIL {src} -> {link} (missing anchor)'); bad = 1
sys.exit(bad)
