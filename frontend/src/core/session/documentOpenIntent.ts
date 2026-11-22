/** Orders user-initiated PDF/Writer Open operations before asynchronous admission. */
let latestIntent = 0;
export function beginDocumentOpenIntent(): number { return ++latestIntent; }
export function isDocumentOpenIntentCurrent(intent: number): boolean { return latestIntent === intent; }
