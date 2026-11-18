#!/usr/bin/env python3
"""Independent native-PDF assertions for ALT WP-01. Never imports production code.

Usage:
  python validation/alt-wp01/native_assert.py --pdf emitted.pdf --case A01 \
    --page 1 --subtype Highlight --text "ALPHA VALVE" --require-ap
  python validation/alt-wp01/native_assert.py --self-test

requires: pypdf==5.9.0, PyMuPDF==1.26.7.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path

def inspect_pdf(path: str, *, page: int, subtype: str, text: str | None, require_ap: bool) -> dict:
    import fitz
    from pypdf import PdfReader
    pdf = PdfReader(path, strict=True)
    assert 1 <= page <= len(pdf.pages), "WRONG_PAGE"
    names = []
    types = []
    page_items = []
    for n, pg in enumerate(pdf.pages, 1):
        for ref in pg.get('/Annots', []):
            obj = ref.get_object()
            name = str(obj.get('/NM', ''))
            if name:
                names.append(name)
            types.append({'page': n, 'subtype': str(obj.get('/Subtype', '')), 'nm': name})
            if n == page and str(obj.get('/Subtype', '')) == '/' + subtype:
                page_items.append(obj)
    assert len(names) == len(set(names)), "DUPLICATE_NATIVE_NM"
    assert page_items, "MISSING_NATIVE_SUBTYPE"
    for obj in page_items:
        box = [float(x) for x in obj.get('/Rect', [])]
        assert len(box) == 4 and all(map(math.isfinite, box)), "MALFORMED_RECT"
        assert box[2] > box[0] and box[3] > box[1], "ZERO_RECT"
        if subtype in {'Highlight', 'Underline', 'StrikeOut', 'Squiggly'}:
            quads = [float(x) for x in obj.get('/QuadPoints', [])]
            assert len(quads) >= 8 and len(quads) % 8 == 0, "MISSING_OR_INVALID_QUADPOINTS"
            assert all(map(math.isfinite, quads)), "NONFINITE_QUADPOINT"
            assert all(box[0] - 0.5 <= x <= box[2] + 0.5 for x in quads[0::2]), "OFF_RECT_QUAD_X"
            assert all(box[1] - 0.5 <= y <= box[3] + 0.5 for y in quads[1::2]), "OFF_RECT_QUAD_Y"
        if require_ap:
            ap = obj.get('/AP')
            assert ap is not None, "MISSING_AP"
            normal = ap.get_object().get('/N')
            assert normal is not None, "MISSING_AP_N"
            stream = normal.get_object()
            assert str(stream.get('/Subtype', '')) == '/Form', "NOT_FORM_AP"
            bbox = list(map(float, stream.get('/BBox', [])))
            assert len(bbox) == 4 and bbox[2] > bbox[0] and bbox[3] > bbox[1], "INVALID_AP_BBOX"
            assert len(stream.get_data()) > 0, "EMPTY_AP_STREAM"
            resources = stream.get('/Resources', {})
            assert '/ExtGState' in resources, "MISSING_AP_ALPHA_RESOURCES"
    with fitz.open(path) as document:
        if text:
            extracted = ''.join(p.get_text() for p in document)
            assert text in extracted, "SOURCE_TEXT_ERASED_OR_CHANGED"
        if subtype == 'Square':
            assert all(t['subtype'] != '/Redact' for t in types), "SECURE_REDACTION_MISCLAIM"
    return {
        'status': 'PASS', 'page': page, 'subtype': subtype, 'matching': len(page_items),
        'annotation_names_unique': True, 'all_native': types,
        'source_text_preserved': text is None or text in extracted,
        'require_ap': require_ap,
    }

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--pdf')
    p.add_argument('--page', type=int, default=1)
    p.add_argument('--subtype', default='Highlight')
    p.add_argument('--text')
    p.add_argument('--case', default='WP01')
    p.add_argument('--require-ap', action='store_true')
    p.add_argument('--self-test', action='store_true')
    p.add_argument('--out')
    args = p.parse_args()
    if args.self_test:
        import fitz
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            positive = Path(td) / 'positive.pdf'
            document = fitz.open()
            page = document.new_page()
            page.insert_text((72, 130), 'ALPHA VALVE')
            annotated = page.add_highlight_annot(fitz.Rect(70, 116, 150, 137))
            annotated.update()
            document.save(positive)
            document.close()
            result = inspect_pdf(str(positive), page=1, subtype='Highlight',
                                 text='ALPHA VALVE', require_ap=True)
            assert result['status'] == 'PASS'
            for wrong_type in ['Underline', 'StrikeOut', 'Square']:
                try:
                    inspect_pdf(str(positive), page=1, subtype=wrong_type,
                                text='ALPHA VALVE', require_ap=True)
                except AssertionError:
                    continue
                raise AssertionError('NEGATIVE_CONTROL_NOT_REJECTED:' + wrong_type)
        print(json.dumps({'self_test': 'PASS', 'wrong_subtype_rejections': 3}))
        return 0
    if not args.pdf:
        p.error('--pdf is required except during --self-test')
    try:
        result = inspect_pdf(args.pdf, page=args.page, subtype=args.subtype,
                             text=args.text, require_ap=args.require_ap)
        result['case'] = args.case
        code = 0
    except Exception as exc:
        result = {'status': 'FAIL', 'case': args.case, 'error': type(exc).__name__ + ': ' + str(exc)}
        code = 1
    output = json.dumps(result, indent=2)
    if args.out:
        Path(args.out).write_text(output + '\n')
    print(output)
    return code

if __name__ == '__main__':
    raise SystemExit(main())
