export const FREE_FILE_LIMIT_MB = 100;

/**
 * Adjusts the margins of a PDF by vector-scaling the content down and centering it.
 * This preserves original searchable text, fonts, and vector paths without rasterization.
 */
export async function adjustPdfMargins(
  file: File,
  marginPercent: number, // 0 to 30% margin on each side
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(5, 'Loading PDF editor library…');
  const { PDFDocument } = await import('pdf-lib');

  onProgress(15, 'Reading PDF content…');
  const bytes = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();

  const numPages = srcDoc.getPageCount();
  const scale = 1 - 2 * (marginPercent / 100);

  for (let i = 0; i < numPages; i++) {
    const pageNum = i + 1;
    const progressPct = 20 + Math.round((i / numPages) * 70);
    onProgress(progressPct, `Scaling page ${pageNum} of ${numPages}…`);

    const originalPage = srcDoc.getPage(i);
    const { width, height } = originalPage.getSize();

    // Embed the page from srcDoc into outDoc
    const [embeddedPage] = await outDoc.embedPdf(srcDoc, [i]);

    // Create page with identical dimensions in the output PDF
    const newPage = outDoc.addPage([width, height]);

    // Calculate position offsets for perfect centering
    const xOffset = width * (marginPercent / 100);
    const yOffset = height * (marginPercent / 100);

    // Draw the embedded page with scaling and offsets
    newPage.drawPage(embeddedPage, {
      x: xOffset,
      y: yOffset,
      xScale: scale,
      yScale: scale,
    });
  }

  onProgress(93, 'Saving adjusted document…');
  const savedBytes = await outDoc.save();
  onProgress(100, 'Done');

  return new Blob([savedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
