#!/usr/bin/env python3
"""B02 only: keep the frozen single-page geometry/AP/content checks, but
recognize all three deliberately annotated pages. Strictly assert the exact
global intended native annotation set. No changes to the frozen validator."""
import argparse, json, tempfile, sys
from pathlib import Path
from collections import Counter
from pypdf import PdfReader
import fitz
import native_pdf
PAGES=(1,50,100)

def validate(path, baseline, page, case):
    result=native_pdf.validate(path,case=case,page=page,subtype='Highlight',anchor='ALPHA VALVE',baseline=baseline)
    expected_non_target={f'unrelated_page_annotation_count_changed_p{n}' for n in PAGES if n!=page}
    removed=[x for x in result['assertions'] if x in expected_non_target]
    issues=[x for x in result['assertions'] if x not in expected_non_target]
    try:
        before=native_pdf.inspect(baseline)
        after=native_pdf.inspect(path)
        reader=PdfReader(path)
        assert len(before['pages'])==len(after['pages'])==100
        ids=[]
        for number,(a,b) in enumerate(zip(after['pages'],before['pages']),1):
            expected=1 if number in PAGES else 0
            assert a['native_annotation_count']==b['native_annotation_count']+expected, f'WRONG_COUNT_PAGE_{number}'
            if not expected: continue
            assert b['native_annotation_count']==0, 'EXPECTED_SYNTHETIC_UNANNOTATED_INPUT'
            annot=a['annotations'][0]
            assert annot['subtype']=='/Highlight' and annot['nm'],f'WRONG_SUBTYPE_OR_ID_PAGE_{number}'
            ids.append(annot['nm'])
            obj=reader.pages[number-1]['/Annots'][0].get_object()
            ap=obj['/AP'].get_object()['/N'].get_object()
            assert str(ap.get('/Subtype'))=='/Form' and len(ap.get_data())>0,f'INVALID_AP_PAGE_{number}'
            g=native_pdf.geometry_error(path,number,annot,'ALPHA VALVE')
            assert 'error' not in g and g['text_coverage']>=.65 and g['center_delta_pt']<=12 and abs(g['left_delta_pt'])<=18 and abs(g['right_delta_pt'])<=18,f'WRONG_GEOMETRY_PAGE_{number}'
        assert len(ids)==len(set(ids))==3, 'DUPLICATE_OR_MISSING_NM'
    except Exception as e:
        issues.append('B02_GLOBAL:'+str(e))
    result['assertions']=issues
    result['status']='FAIL' if issues else 'PASS'
    result['reconciled_intended_pages']=list(PAGES)
    result['original_unrelated_page_assertions']=removed
    return result

def selftest(baseline):
    with tempfile.TemporaryDirectory() as td:
        results={}
        for kind in ['positive','extra','missing','duplicate','wrong_geometry','missing_ap']:
            file=Path(td)/(kind+'.pdf')
            with fitz.open(baseline) as doc:
                pages=list(PAGES)
                if kind=='extra':pages.append(2)
                if kind=='missing':pages.remove(100)
                for n in pages:
                    p=doc[n-1]; box=p.search_for('ALPHA VALVE')[0]
                    if kind=='wrong_geometry' and n==50:box=fitz.Rect(box.x0+80,box.y0,box.x1+80,box.y1)
                    a=p.add_highlight_annot(box);a.update()
                    doc.xref_set_key(a.xref,'NM',f'(id-{1 if kind=="duplicate" else n})')
                    if kind=='missing_ap' and n==50:doc.xref_set_key(a.xref,'AP','null')
                doc.save(file)
            v=validate(file,baseline,1,'B02-p1-control')
            results[kind]=v['status']
            assert v['status']==('PASS' if kind=='positive' else 'FAIL'),(kind,v)
        print(json.dumps(results))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--selftest',type=Path)
    parser.add_argument('command',nargs='?')
    parser.add_argument('--input',type=Path)
    parser.add_argument('--baseline',type=Path)
    parser.add_argument('--case')
    parser.add_argument('--page',type=int,default=1)
    parser.add_argument('--subtype');parser.add_argument('--anchor');parser.add_argument('--output',type=Path)
    a=parser.parse_args()
    if a.selftest: selftest(a.selftest);return 0
    assert a.command=='validate' and a.subtype=='Highlight' and a.anchor=='ALPHA VALVE'
    result=validate(a.input,a.baseline,a.page,a.case)
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result));return int(result['status']!='PASS')
if __name__=='__main__':sys.exit(main())
