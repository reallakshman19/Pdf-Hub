from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return content.replace(old, new, 1)


page_path = 'frontend/src/core/macro/steps/page-ops.ts'
page = read(page_path)
page = replace_once(
    page,
    "import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';\n",
    "import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';\nimport type { PdfEditOperationOptions } from '../../../adapters/pdf-edit/PdfEditAdapter';\n",
    'page import',
)
page = replace_once(
    page,
    "export interface PageSelectionState {\n  pageCount: number;\n  selectedPages: number[];\n  currentPage?: number;\n}\n",
    "export interface PageSelectionState {\n  pageCount: number;\n  selectedPages: number[];\n  currentPage?: number;\n}\n\nfunction operationArgs(\n  signal: AbortSignal | undefined,\n): [] | [PdfEditOperationOptions] {\n  return signal ? [{ signal }] : [];\n}\n",
    'page helper',
)
page = page.replace(
    '{ signal: ctx.options?.abortSignal }',
    '...operationArgs(ctx.options?.abortSignal)',
)
page = replace_once(
    page,
    'PdfEditAdapter.getPageSize(currentBytes, referencePage, { signal })',
    'PdfEditAdapter.getPageSize(currentBytes, referencePage, ...operationArgs(signal))',
    'page getPageSize',
)
if '{ signal: ctx.options?.abortSignal }' in page:
    raise RuntimeError('page optional abort argument remained')
write(page_path, page)


document_path = 'frontend/src/core/macro/steps/document-ops.ts'
document = read(document_path)
document = replace_once(
    document,
    "import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';\n",
    "import { PdfEditAdapter } from '../../../adapters/pdf-edit/PdfEditAdapter';\nimport type { PdfEditOperationOptions } from '../../../adapters/pdf-edit/PdfEditAdapter';\n",
    'document import',
)
document = replace_once(
    document,
    "import {\n  buildContentPagePdf,\n  buildImageHeaderPagePdf,\n} from '../layout/LayoutEngine';\n",
    "import {\n  buildContentPagePdf,\n  buildImageHeaderPagePdf,\n} from '../layout/LayoutEngine';\n\nfunction operationArgs(\n  signal: AbortSignal | undefined,\n): [] | [PdfEditOperationOptions] {\n  return signal ? [{ signal }] : [];\n}\n",
    'document helper',
)
document = document.replace(
    '{ signal: ctx.options?.abortSignal }',
    '...operationArgs(ctx.options?.abortSignal)',
)
if '{ signal: ctx.options?.abortSignal }' in document:
    raise RuntimeError('document optional abort argument remained')
write(document_path, document)

print('Updated optional abort argument forwarding.')
