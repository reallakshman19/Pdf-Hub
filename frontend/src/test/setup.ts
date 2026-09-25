import '@testing-library/jest-dom';

// Polyfill IntersectionObserver for jsdom (not implemented in jsdom)
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
}

// Polyfill DOMMatrix for pdfjs-dist in vitest (jsdom) environment
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrixMock {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(init?: string | number[]) {
      if (Array.isArray(init) && init.length === 6) {
        this.a = init[0];
        this.b = init[1];
        this.c = init[2];
        this.d = init[3];
        this.e = init[4];
        this.f = init[5];
      }
    }
  } as unknown as typeof DOMMatrix;
}

// Polyfill Promise.try for Node 22 (required for pdfjs-dist@5.6.205)
if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
  (Promise as unknown as { try: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> }).try = function (fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

// Polyfill Uint8Array.prototype.toHex and toBase64 for Node 22 (required for pdfjs-dist@5.6.205)
if (typeof (Uint8Array.prototype as unknown as { toHex?: unknown }).toHex !== 'function') {
  (Uint8Array.prototype as unknown as { toHex: (this: Uint8Array) => string }).toHex = function (this: Uint8Array) {
    return Array.from(this)
      .map((b: number) => b.toString(16).padStart(2, '0'))
      .join('');
  };
}

if (typeof (Uint8Array.prototype as unknown as { toBase64?: unknown }).toBase64 !== 'function') {
  (Uint8Array.prototype as unknown as { toBase64: (this: Uint8Array) => string }).toBase64 = function (this: Uint8Array) {
    return Buffer.from(this).toString('base64');
  };
}

// Polyfill localStorage/sessionStorage for jsdom in environments where globalThis.localStorage is restricted
if (typeof window !== 'undefined') {
  const mockStorage = () => {
    let store: Record<string, string> = {};
    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
      key: (index: number) => Object.keys(store)[index] || null,
      get length() {
        return Object.keys(store).length;
      },
    };
  };

  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: mockStorage() });
  }
  if (!globalThis.localStorage) {
    Object.defineProperty(globalThis, 'localStorage', { value: window.localStorage });
  }
}

