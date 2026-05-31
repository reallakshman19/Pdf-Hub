import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

async function main() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  page.drawText('DocCraft Test Fixture PDF', {
    x: 50,
    y: 750,
    size: 24,
  });
  page.drawText('This is a simple valid PDF document used for Playwright E2E and integration tests.', {
    x: 50,
    y: 700,
    size: 12,
  });

  const pdfBytes = await pdfDoc.save();
  const destDir = path.resolve('frontend/test-fixtures');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const destPath = path.join(destDir, 'sample.pdf');
  fs.writeFileSync(destPath, pdfBytes);
  console.log(`Successfully generated valid test PDF at ${destPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
