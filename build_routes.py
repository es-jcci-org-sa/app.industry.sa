#!/usr/bin/env python3
"""Build real Pages routes automatically; no per-record HTML in source."""
from pathlib import Path
import json
import re
import shutil
import tempfile

ROOT = Path(__file__).resolve().parent
ID = re.compile(r'[A-Za-z0-9_-]{1,128}\Z')


def build():
    records = []
    for path in sorted((ROOT / 'data').glob('*.json')):
        if not ID.fullmatch(path.stem):
            raise ValueError(f'Invalid record filename: {path.name}')
        data = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(data, dict):
            raise ValueError(f'Record must be a JSON object: {path.name}')
        view = data.get('view')
        if not isinstance(view, dict) or not isinstance(view.get('sections'), list) or not isinstance(view.get('header'), dict) or not isinstance(view.get('summary'), dict):
            raise ValueError(f'Record must contain its own complete view: {path.name}')
        records.append(path.stem)
    output = ROOT / '_site'
    staging = Path(tempfile.mkdtemp(prefix='.pages-build-', dir=ROOT))
    try:
        for name in ['assets', 'css', 'fonts', 'images', 'js', 'data']:
            shutil.copytree(ROOT / name, staging / name)
        for name in ['index.html', '404.html', '.nojekyll', 'CNAME', 'sw.js']:
            if (ROOT / name).is_file():
                shutil.copyfile(ROOT / name, staging / name)
        entry = staging / 'license/view/index.html'
        entry.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'index.html', entry)
        for record in records:
            entry = staging / 'license/view' / record / 'index.html'
            entry.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'index.html', entry)
        if output.exists():
            shutil.rmtree(output)
        staging.rename(output)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    print(f'Built {len(records)} records into _site/')


if __name__ == '__main__':
    build()
