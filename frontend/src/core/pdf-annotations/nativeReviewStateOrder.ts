/** A state reply from the same identified author succeeds its parent even when
 * their clocks disagree. Unrelated authors remain ordered by native timestamps. */
export function orderNativeReviewStates<T>(
  records: readonly T[],
  values: (record: T) => { key: string | null; parent: string | null; author: string | null; time: number; index: number },
): T[] {
  const entries = records.map((record) => ({ record, ...values(record) }));
  const byKey = new Map(entries.filter((entry) => entry.key).map((entry) => [entry.key!, entry]));
  const children = new Map<typeof entries[number], typeof entries>();
  const blocked = new Set<typeof entries[number]>();
  for (const entry of entries) {
    const parent = entry.parent ? byKey.get(entry.parent) : undefined;
    const author = entry.author?.trim();
    const parentAuthor = parent?.author?.trim();
    if (!parent || !author || author === 'Unknown' || author !== parentAuthor) continue;
    const siblings = children.get(parent) ?? [];
    siblings.push(entry);
    children.set(parent, siblings);
    blocked.add(entry);
  }
  const compare = (a: typeof entries[number], b: typeof entries[number]) => a.time - b.time || a.index - b.index;
  const ready: typeof entries = [];
  const push = (entry: typeof entries[number]) => {
    ready.push(entry);
    let index = ready.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compare(ready[parent], ready[index]) <= 0) break;
      [ready[parent], ready[index]] = [ready[index], ready[parent]];
      index = parent;
    }
  };
  const pop = () => {
    const first = ready[0];
    const last = ready.pop()!;
    if (ready.length) {
      ready[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1; const right = left + 1;
        if (left >= ready.length) break;
        const child = right < ready.length && compare(ready[right], ready[left]) < 0 ? right : left;
        if (compare(ready[index], ready[child]) <= 0) break;
        [ready[index], ready[child]] = [ready[child], ready[index]];
        index = child;
      }
    }
    return first;
  };
  for (const entry of entries) if (!blocked.has(entry)) push(entry);
  const result: T[] = [];
  while (ready.length) {
    const entry = pop();
    result.push(entry.record);
    for (const child of children.get(entry) ?? []) {
      blocked.delete(child);
      push(child);
    }
  }
  // A malformed cycle has no unambiguous ancestry; retain deterministic
  // timestamp order for it rather than inventing a parent-child sequence.
  result.push(...entries.filter((entry) => blocked.has(entry)).sort(compare).map((entry) => entry.record));
  return result;
}
