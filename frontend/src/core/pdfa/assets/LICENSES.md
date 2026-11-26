# Archival Font Asset Licenses

The compressed archival fallback fonts in `archivalFontBundle.ts` are derived directly from the redistributable font files shipped in `pdfjs-dist/standard_fonts/`:

1. **Liberation Sans (`LiberationSans-Regular.ttf`, `Bold.ttf`, `Italic.ttf`, `BoldItalic.ttf`)**
   - Copyright (c) 2010 Google Corporation / 2012 Red Hat, Inc.
   - License: **SIL Open Font License (OFL), Version 1.1** (`node_modules/pdfjs-dist/standard_fonts/LICENSE_LIBERATION`).
   - Used for Standard-14 `Helvetica` / `Arial` TrueType embedding and subsetted Unicode archival text authoring (`@pdf-lib/fontkit`).

2. **PDFium / Foxit Standard-14 Type 1 Font Programs**
   - `FoxitSerif.pfb`, `FoxitSerifBold.pfb`, `FoxitSerifItalic.pfb`, `FoxitSerifBoldItalic.pfb`
   - `FoxitFixed.pfb`, `FoxitFixedBold.pfb`, `FoxitFixedItalic.pfb`, `FoxitFixedBoldItalic.pfb`
   - `FoxitSymbol.pfb`, `FoxitDingbats.pfb`
   - Copyright 2014 PDFium Authors (Google Inc.).
   - License: **BSD 3-Clause** (`node_modules/pdfjs-dist/standard_fonts/LICENSE_FOXIT`).
   - Used for genuine Type 1 `/FontFile` embedding on Standard-14 `Times`, `Courier`, `Symbol`, and `ZapfDingbats` fonts during ISO 19005 remediation.
