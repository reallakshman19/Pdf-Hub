from pathlib import Path

path = Path('frontend/src/components/sidebar/PsIsonoteRecipeBuilder.tsx')
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f'Expected builder snippet not found:\n{old}')
    text = text.replace(old, new, 1)


replace_once(
    """import {
  parsePsIsonoteTable,
  type PsIsonoteParseResult,
} from '@/core/macro/psIsonote/psIsonoteTable';
""",
    """import type { PsIsonoteParseResult } from '@/core/macro/psIsonote/psIsonoteTable';
import {
  admitPsIsonoteTextCandidate,
  admitPsIsonoteTextFile,
  type AdmittedPsIsonoteTextSource,
} from '@/core/macro/psIsonote/psIsonoteTextAdmission';
import type { PsIsonoteTextAdmissionEvidenceV1 } from '@/core/macro/psIsonote/psIsonoteTextAdmissionEvidence';
""",
)

replace_once(
    """function parseSource(sourceText: string): ParsedState {
  if (!sourceText.trim()) return { result: null, error: null };
  try {
    return { result: parsePsIsonoteTable(sourceText), error: null };
  } catch (error) {
    return {
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

""",
    """,
)

replace_once(
    """  const [sourceText, setSourceText] = React.useState('');
  const [sourceName, setSourceName] = React.useState('');
""",
    """  const [sourceText, setSourceText] = React.useState('');
  const [sourceName, setSourceName] = React.useState('');
  const [parsedState, setParsedState] = React.useState<ParsedState>({ result: null, error: null });
  const [admissionEvidence, setAdmissionEvidence] = React.useState<PsIsonoteTextAdmissionEvidenceV1 | null>(null);
""",
)

replace_once(
    """  const parsedState = React.useMemo(() => parseSource(sourceText), [sourceText]);
""",
    """,
)

replace_once(
    """  const clearRunArtifacts = React.useCallback(() => {
    setScanArtifact(null);
    setAuditArtifact(null);
    setMessage(null);
  }, []);
""",
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
  }, [clearRunArtifacts]);
""",
)

replace_once(
    """  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setSourceText(await file.text());
      setSourceName(file.name);
      clearRunArtifacts();
      setError(null);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : String(fileError));
    }
  };

  const handleSample = React.useCallback((sample: PsIsonoteSample) => {
    setSourceText(sample.content);
    setSourceName(sample.fileName);
    clearRunArtifacts();
    setError(null);
    setMessage(`Loaded ${sample.label} sample mapping.`);
  }, [clearRunArtifacts]);
""",
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
""",
)

replace_once(
    """      {sourceName && <div className="truncate text-[11px] text-slate-500">Source: {sourceName}</div>}

      <textarea
""",
    """      {sourceName && <div className="truncate text-[11px] text-slate-500">Source: {sourceName}</div>}

      {admissionEvidence && (
        <div
          aria-label="PS ISONOTE admission metrics"
          className="text-[10px] text-slate-500 dark:text-slate-400"
        >
          {admissionEvidence.logicalRowCount} rows · {admissionEvidence.maximumObservedColumns} columns ·{' '}
          {admissionEvidence.uniqueMappingCount} mappings · {admissionEvidence.sourceUtf8Bytes} bytes
        </div>
      )}

      <textarea
""",
)

replace_once(
    """        value={sourceText}
        onChange={(event) => {
          setSourceText(event.target.value);
          setSourceName('');
          clearRunArtifacts();
          setError(null);
        }}
""",
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
        }}
""",
)

path.write_text(text)

test_path = Path('frontend/src/components/sidebar/PsIsonoteRecipeBuilder.admission.test.tsx')
test_path.write_text(test_path.read_text().replace('1 mappings · 35 bytes', '1 mappings · 30 bytes'))
