import hashlib,json,pathlib,sys,zipfile
archive,dest,expected,baseline=sys.argv[1:]
dest=pathlib.Path(dest)
def digest(b):return hashlib.sha256(b).hexdigest()
with zipfile.ZipFile(archive) as z:
    names=z.namelist()
    assert len(names)==len(set(names)) and z.testzip() is None
    assert all(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts and not n.endswith('/') for n in names)
    assert all((i.external_attr >> 16)&0o170000 != 0o120000 for i in z.infolist())
    manifest=json.loads(z.read('evidence-manifest.json'))
    assert (manifest.get('baseline_sha') or manifest.get('accepted_baseline_sha'))==baseline
    assert manifest['authority']=='READ_ONLY' and manifest['stage_2_authorized'] is False
    assert digest(z.read('expected-model.json'))==expected==manifest['frozen_expected_model_sha256']
    files=manifest['files']
    assert set(names)=={'evidence-manifest.json'}|{r['path'] for r in files}
    for r in files:
        b=z.read(r['path'])
        assert len(b)==r['bytes'] and digest(b)==r['sha256'],r['path']
    z.extractall(dest)
print(json.dumps({'archive_members':len(names),'verified_manifest_entries':len(files),'expected_sha':expected,'baseline':baseline}))
