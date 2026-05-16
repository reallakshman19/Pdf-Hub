cat << 'INNER_EOF' > patch.diff
--- frontend/src/adapters/pdf-renderer/PdfRendererAdapter.ts
+++ frontend/src/adapters/pdf-renderer/PdfRendererAdapter.ts
@@ -60,11 +60,17 @@

 export class PdfRendererAdapter {
+  private static cachedDoc: { bytes: Uint8Array | ArrayBuffer; doc: PDFDocumentProxy } | null = null;
+
   /**
    * Parses a PDF byte array into a PDFDocumentProxy using PDF.js.
    * The caller is responsible for calling `.destroy()` when finished.
    */
   static async loadDocument(buffer: Uint8Array | ArrayBuffer): Promise<PDFDocumentProxy> {
+    if (this.cachedDoc && this.cachedDoc.bytes === buffer) {
+      return this.cachedDoc.doc;
+    }
+
     try {
       // PDF.js may transfer typed-array buffers to the worker, which detaches them.
       // Clone input bytes so shared session state remains readable across reloads.
@@ -74,7 +80,11 @@
           : buffer.slice(0);

       const task = getDocument({ data });
-      return await task.promise;
+      const doc = await task.promise;
+      if (this.cachedDoc) {
+        await this.cachedDoc.doc.destroy();
+      }
+      this.cachedDoc = { bytes: buffer, doc };
+      return doc;
     } catch (err) {
       logError('pdf-renderer', 'Failed to load document via PDF.js', {
         error: String(err),
INNER_EOF
patch -p0 < patch.diff
