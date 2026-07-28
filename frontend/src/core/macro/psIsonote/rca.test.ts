import { describe, it } from 'vitest';
import fs from 'node:fs';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { getDocument } from 'pdfjs-dist';

describe('RCA', () => {
  it('checks 11167 in PDF', async () => {
    const pdfPath = 'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001.pdf';
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const items = await PdfRendererAdapter.getPageTextItems(page, 1);
    
    console.log('All items containing 11167:');
    items.filter(item => item.text.includes('11167')).forEach(item => {
      console.log(`- "${item.text}"`);
    });
    
    // Check joined text
    let fullText = '';
    for (const item of items) {
      fullText += item.text + ' ';
    }
    
    const PS_REFERENCE_PATTERN = /\bP\s*S\s*[-‐‑‒–—−]\s*[0-9]{2,12}(?:\s*(?:\.|\/)\s*[A-Z0-9]{1,12})*\b/gi;
    let match;
    console.log('Regex matches:');
    while ((match = PS_REFERENCE_PATTERN.exec(fullText)) !== null) {
      if (match[0].includes('11167')) {
         console.log(`Regex matched: "${match[0]}" at index ${match.index}`);
      }
    }
    
    // Parse CSV
    const { parsePsIsonoteTable } = await import('./psIsonoteTable');
    const csvText = fs.readFileSync('D:/Code3/Tag to PDF/BM2/Navis based ISONOTE.csv', 'utf8');
    const parsed = parsePsIsonoteTable(csvText);
    const mappings11167 = parsed.mappings.filter(m => m.psNo.includes('11167') || m.isonote.includes('11167'));
    console.log('CSV Mappings for 11167:');
    console.log(JSON.stringify(mappings11167, null, 2));
  });
});
