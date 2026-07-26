from pathlib import Path
import re

path = Path('frontend/src/components/sidebar/PsIsonoteRecipeBuilder.tsx')
text = path.read_text()


def sub_once(pattern: str, replacement: str, *, flags: int = 0) -> None:
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'Expected exactly one builder match, found {count}: {pattern}')


sub_once(
    r"import \{\s*parsePsIsonoteTable,\s*type PsIsonoteParseResult,\s*\} from '@/core/macro/psIsonote/psIsonoteTable';",
    """import type { PsIsonoteParseResult } from '@/core/macro/psIsonote/psIsonoteTable';
import {
  admitPsIsonoteTextCandidate,
  admitPsIsonoteTextFile,
  type AdmittedPsIsonoteTextSource,
} from '@/core/macro/psIsonote/psIsonoteTextAdmission';
import type { PsIsonoteTextAdmissionEvidenceV1 } from '@/core/macro/psIsonote/psIsonoteTextAdmissionEvidence';""",
)

sub_once(
    r"function parseSource\(sourceText: string\): ParsedState \{.*?\n\}\n\n(?=function buildSelector)",
    "",
    flags=re.S,
)

sub_once(
    r"  const \[sourceText, setSourceText\] = React\.useState\(''\);\n  const \[sourceName, setSourceName\] = React\.useState\(''\);",
    """  const [sourceText, setSourceText] = React.useState('');
  const [sourceName, setSourceName] = React.useState('');
  const [parsedState, setParsedState] = React.useState<ParsedState>({ result: null, error: null });
  const [admissionEvidence, setAdmissionEvidence] = React.useState<PsIsonoteTextAdmissionEvidenceV1 | null>(null);""",
)

sub_once(
    r"  const parsedState = React\.useMemo\(\(\) => parseSource\(sourceText\), \[sourceText\]\);\n",
    "",
)

sub_once(
    r"  const clearRunArtifacts = React\.useCallback\(\(\) => \{\n    setScanArtifact\(null\);\n    setAuditArtifact\(null\);\n    setMessage\(null\);\n  \}, \[\]\);",
    """  const clearRunArtifacts = React.useCallback(() => {
    setScanArtifact(null);
    setAuditArtifact(null);
    setMessage(null);
  }, []);

  const commitAdmittedSource = React.useCallback((
    admitted: AdmittedPsIsonoteTextSource,
    nextSourceName: string,
    successMessage?: string,
  ) => {
    setSourceText(admitted.sourceText);
    setSourceName(nextSourceName);
    setParsedState({ result: admitted.parsedResult, error: admitted.parseError });
    setAdmissionEvidence(admitted.evidence);
    clearRunArtifacts();
    setError(null);
    if (successMessage) setMessage(successMessage);
  }, [clearRunArtifacts]);""",
)

sub_once(
    r"  const handleFile = async \(file: File \| undefined\) => \{.*?\n  const handlePreview = async \(\) => \{",
    """  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const admitted = await admitPsIsonoteTextFile(file);
      commitAdmittedSource(admitted, file.name);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : String(fileError));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSample = React.useCallback((sample: PsIsonoteSample) => {
    try {
      const admitted = admitPsIsonoteTextCandidate({
        inputKind: 'SAMPLE',
        sourceName: sample.fileName,
        sourceText: sample.content,
      });
      commitAdmittedSource(admitted, sample.fileName, `Loaded ${sample.label} sample mapping.`);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : String(sampleError));
    }
  }, [commitAdmittedSource]);

  const handlePreview = async () => {""",
    flags=re.S,
)

sub_once(
    r"(      \{sourceName && <div className=\"truncate text-\[11px\] text-slate-500\">Source: \{sourceName\}</div>\}\n\n)(      <textarea)",
    r"""\1      {admissionEvidence && (
        <div
          aria-label="PS ISONOTE admission metrics"
          className="text-[10px] text-slate-500 dark:text-slate-400"
        >
          {admissionEvidence.logicalRowCount} rows · {admissionEvidence.maximumObservedColumns} columns ·{' '}
          {admissionEvidence.uniqueMappingCount} mappings · {admissionEvidence.sourceUtf8Bytes} bytes
        </div>
      )}

\2""",
)

sub_once(
    r"        value=\{sourceText\}\n        onChange=\{\(event\) => \{\n          setSourceText\(event\.target\.value\);\n          setSourceName\(''\);\n          clearRunArtifacts\(\);\n          setError\(null\);\n        \}\}",
    """        value={sourceText}
        disabled={isScanning || isRunning || isPackaging}
        onChange={(event) => {
          try {
            const admitted = admitPsIsonoteTextCandidate({
              inputKind: 'PASTE',
              sourceText: event.target.value,
            });
            commitAdmittedSource(admitted, '');
          } catch (candidateError) {
            setError(candidateError instanceof Error ? candidateError.message : String(candidateError));
          }
        }}""",
)

path.write_text(text)

test_path = Path('frontend/src/components/sidebar/PsIsonoteRecipeBuilder.admission.test.tsx')
test_path.write_text(test_path.read_text().replace('1 mappings · 35 bytes', '1 mappings · 30 bytes'))
