# Phase 9 PDF Fidelity Corpus

This directory is the machine-readable source of truth for the Phase 9 fidelity laboratory.

## Authority

- `manifest.json` declares every required fidelity fixture class.
- Each entry records provenance, baseline semantic expectations, and expected disposition for every structural mutation class in issue #286.
- `availability: "generated"` means the fixture is backed by the deterministic generator in `scripts/phase9-generate-fidelity-fixtures.mjs`.
- `availability: "required-pending"` is an explicit unsatisfied corpus obligation. It is not fixture coverage and must never be counted as Phase 9 acceptance.
- A future `availability: "retained"` fixture must point to a legally redistributable retained artifact with recorded provenance.

Generated PDFs are intentionally not committed. Rebuild them with:

```bash
npm run generate:phase9-fidelity-fixtures
```

Validate manifest/generator consistency with:

```bash
npm run audit:phase9-fidelity-corpus
npm run certify:phase9-step1
```

## Current deterministic starter set

The generator currently produces fixtures for:

- ordinary native text;
- scanned/image-only content;
- mixed page sizes and rotations;
- non-zero MediaBox/CropBox origins;
- nested outline destinations;
- PageLabels;
- a populated AcroForm field/widget;
- a native text annotation;
- an embedded attachment and document metadata;
- object-stream serialization.

The manifest also declares, but does not yet satisfy, specialist fixture obligations for tagged PDF structure, CID/subset fonts plus Arabic/CJK/RTL, genuine incremental updates, encryption, cryptographic signatures, and malformed-but-PDF.js-readable xrefs.

## Fidelity rule

Rendering success is never sufficient evidence. The later Phase 9 inventory/diff harness must compare fixture-declared semantic structures through both save/reopen cycles and must preserve, explicitly transform/invalidate, or reject each tested mutation exactly as declared.
