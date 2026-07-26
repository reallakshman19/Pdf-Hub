from pathlib import Path

source_path = Path('frontend/src/core/macro/psIsonote/psIsonoteTextAdmission.ts')
source = source_path.read_text()
old_source = """  return extensionAllowed && (
    mimeType.length === 0 ||
    ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])
  );
"""
new_source = """  const mimeAllowed = ALLOWED_MIME_TYPES.includes(
    mimeType as (typeof ALLOWED_MIME_TYPES)[number],
  );
  return extensionAllowed || mimeAllowed;
"""
if old_source not in source:
    raise SystemExit('Expected file compatibility gate not found.')
source_path.write_text(source.replace(old_source, new_source, 1))

test_path = Path('frontend/src/core/macro/psIsonote/psIsonoteTextAdmission.test.ts')
test = test_path.read_text()
old_test = """  it('rejects unsupported file extensions and incompatible MIME types', async () => {
    const bytes = new TextEncoder().encode(VALID_CSV);
    const extension = fakeFile({ name: 'mapping.json', size: bytes.length, bytes });
    await expectFileRejection(
      admitPsIsonoteTextFileForTest(extension.file, policy()),
      'REJECTED_SOURCE_TYPE',
    );
    expect(extension.arrayBuffer).not.toHaveBeenCalled();

    const mime = fakeFile({ name: 'mapping.csv', type: 'application/json', size: bytes.length, bytes });
    await expectFileRejection(
      admitPsIsonoteTextFileForTest(mime.file, policy()),
      'REJECTED_SOURCE_TYPE',
    );
    expect(mime.arrayBuffer).not.toHaveBeenCalled();
  });
"""
new_test = """  it('preserves extension-or-MIME compatibility while rejecting unrelated files', async () => {
    const bytes = new TextEncoder().encode(VALID_CSV);

    const extensionOnly = fakeFile({
      name: 'mapping.csv',
      type: 'application/octet-stream',
      size: bytes.length,
      bytes,
    });
    expect((await admitPsIsonoteTextFileForTest(extensionOnly.file, policy())).parsedResult?.mappings)
      .toHaveLength(1);

    const mimeOnly = fakeFile({
      name: 'mapping.data',
      type: 'text/csv',
      size: bytes.length,
      bytes,
    });
    expect((await admitPsIsonoteTextFileForTest(mimeOnly.file, policy())).parsedResult?.mappings)
      .toHaveLength(1);

    const unrelated = fakeFile({
      name: 'mapping.json',
      type: 'application/json',
      size: bytes.length,
      bytes,
    });
    await expectFileRejection(
      admitPsIsonoteTextFileForTest(unrelated.file, policy()),
      'REJECTED_SOURCE_TYPE',
    );
    expect(unrelated.arrayBuffer).not.toHaveBeenCalled();
  });
"""
if old_test not in test:
    raise SystemExit('Expected file compatibility test not found.')
test_path.write_text(test.replace(old_test, new_test, 1))
