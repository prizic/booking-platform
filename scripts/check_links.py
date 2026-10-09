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
# `dist-distribution` is the issue #29 export: build output, not source. Its
# links are checked against the exported tree by the export itself.
ignored_directories = {'.artifacts', '.impeccable', '.git', '.next', '.turbo', 'coverage', 'dist',
                      'dist-distribution', 'node_modules'}

for src in sorted(pathlib.Path('.').rglob('*.md')):
    if ignored_directories.intersection(src.parts):
        continue
    prose = re.sub(r'^([ \t]*)(`{3,}|~{3,})[^\n]*\n.*?^\1\2[ \t]*$', '', src.read_text(), flags=re.M | re.S)
    for link in re.findall(r'\]\(([^)\s]+)\)', prose):
        if re.match(r'^(https?:|mailto:|tel:)', link):
            continue
        path, _, frag = link.partition('#')
        # A leading `/` is a filesystem-absolute path, not a repository-relative
        # one. It resolves on the workstation that wrote it and fails on every
        # other machine, which is how a Linux runner rejected a link that passed
        # locally. Reject it everywhere so the failure is not machine-dependent;
        # write the path as inline code instead.
        if path.startswith('/'):
            print(f'  FAIL {src} -> {link} (workstation-absolute link; use a repository-relative path or inline code)')
            bad = 1; continue
        tgt = (src.parent / path) if path else src
        if not tgt.exists():
            print(f'  FAIL {src} -> {link} (missing file)'); bad = 1; continue
        if frag and tgt.suffix == '.md' and frag.lower() not in anchors(tgt):
            print(f'  FAIL {src} -> {link} (missing anchor)'); bad = 1
sys.exit(bad)
