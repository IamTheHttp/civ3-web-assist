#!/usr/bin/env python3
"""Builds index.html: inlines src/blast.js and src/civ3parse.js into src/template.html.

Usage:  python3 build.py
The output is one self-contained HTML file. It works from disk and on GitHub Pages.
"""
from pathlib import Path

here = Path(__file__).resolve().parent
src = here / 'src'
template = (src / 'template.html').read_text(encoding='utf-8')
html = (template
        .replace('/*BLAST*/', (src / 'blast.js').read_text(encoding='utf-8'))
        .replace('/*PARSER*/', (src / 'civ3parse.js').read_text(encoding='utf-8')))
out = here / 'index.html'
out.write_text(html, encoding='utf-8')
print(f'wrote {out} ({len(html):,} bytes)')
