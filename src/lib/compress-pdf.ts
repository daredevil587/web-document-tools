// FREE_FILE_LIMIT_MB — future Pro gate: raise this limit for paid tier
export const FREE_FILE_LIMIT_MB = 50;

export async function compressPdf(
  file: File,
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(5, 'Loading PDF library…');
  const { PDFDocument } = await import('pdf-lib');

  onProgress(20, 'Reading file…');
  const bytes = await file.arrayBuffer();

  onProgress(40, 'Parsing PDF…');
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: false });

  onProgress(65, 'Compressing…');
  // pdf-lib re-serialises with object streams which removes redundant data
  const compressed = await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });

  onProgress(100, 'Done');
  return new Blob([compressed.buffer as ArrayBuffer], { type: 'application/pdf' });
}
