from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


scheduler_path = Path("frontend/src/core/renderer/renderScheduler.ts")
scheduler = scheduler_path.read_text()
scheduler = replace_once(
    scheduler,
    """  private activeJobs = 0;\n  private sequence = 0;\n\n  constructor(private readonly maxConcurrent = 3) {\n    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {\n      throw new Error('RenderScheduler maxConcurrent must be a positive integer.');\n    }\n  }\n""",
    """  private activeJobs = 0;\n  private sequence = 0;\n  private readonly maxConcurrent: number;\n\n  constructor(maxConcurrent = 3) {\n    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {\n      throw new Error('RenderScheduler maxConcurrent must be a positive integer.');\n    }\n    this.maxConcurrent = maxConcurrent;\n  }\n""",
    "scheduler constructor",
)
scheduler_path.write_text(scheduler)

cache_path = Path("frontend/src/core/renderer/renderResourceCache.ts")
cache = cache_path.read_text()
cache = replace_once(
    cache,
    """  private readonly entries = new Map<K, RenderResourceCacheEntry<T>>();\n  private totalBytes = 0;\n\n  constructor(private readonly maxBytes: number) {\n    if (!Number.isFinite(maxBytes) || maxBytes < 0) {\n      throw new Error('ByteBoundedLruCache maxBytes must be non-negative.');\n    }\n  }\n""",
    """  private readonly entries = new Map<K, RenderResourceCacheEntry<T>>();\n  private totalBytes = 0;\n  private readonly maxBytes: number;\n\n  constructor(maxBytes: number) {\n    if (!Number.isFinite(maxBytes) || maxBytes < 0) {\n      throw new Error('ByteBoundedLruCache maxBytes must be non-negative.');\n    }\n    this.maxBytes = maxBytes;\n  }\n""",
    "cache constructor",
)
cache_path.write_text(cache)

test_path = Path("frontend/src/core/renderer/renderScheduler.test.ts")
test = test_path.read_text()
test = replace_once(
    test,
    """    let taskSignal: AbortSignal | null = null;\n\n    const run = vi.fn(async (signal: AbortSignal) => {\n      taskSignal = signal;\n""",
    """    const taskSignal: { current?: AbortSignal } = {};\n\n    const run = vi.fn(async (signal: AbortSignal) => {\n      taskSignal.current = signal;\n""",
    "scheduler test signal holder",
)
test = replace_once(
    test,
    """    expect(taskSignal?.aborted).toBe(false);\n\n    secondController.abort('second view left');\n    await expect(second).rejects.toSatisfy(isOperationCancelledError);\n    expect(taskSignal?.aborted).toBe(true);\n""",
    """    expect(taskSignal.current).toBeDefined();\n    expect(taskSignal.current?.aborted).toBe(false);\n\n    secondController.abort('second view left');\n    await expect(second).rejects.toSatisfy(isOperationCancelledError);\n    expect(taskSignal.current?.aborted).toBe(true);\n""",
    "scheduler test signal assertions",
)
test_path.write_text(test)

sidebar_path = Path("frontend/src/components/sidebar/panels/ThumbnailSidebar.tsx")
sidebar = sidebar_path.read_text()
sidebar = sidebar.replace(
    "import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';\n",
    "",
)
sidebar_path.write_text(sidebar)
