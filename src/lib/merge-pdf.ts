// FREE_FILE_LIMIT_MB — future Pro gate
export const FREE_FILE_LIMIT_MB = 50;
export const FREE_FILE_COUNT = 20;

export async function mergePdfs(
  files: File[],
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(5, 'Loading PDF library…');
  const { PDFDocument } = await import('pdf-lib');

  const merger = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const pct = 10 + Math.round((i / files.length) * 80);
    onProgress(pct, `Merging file ${i + 1} of ${files.length}…`);

    const bytes = await files[i].arrayBuffer();
    const src = await PDFDocument.load(bytes);
    const pages = await merger.copyPages(src, src.getPageIndices());
    pages.forEach(p => merger.addPage(p));
  }

  onProgress(95, 'Saving merged PDF…');
  const merged = await merger.save();

  onProgress(100, 'Done');
  return new Blob([merged.buffer as ArrayBuffer], { type: 'application/pdf' });
}
