export const FREE_FILE_LIMIT_MB = 100;

export type RotationDegrees = 90 | 180 | 270;

export interface RotatePage {
  pageNum: number;      // 1-based
  thumbDataUrl: string;
  rotation: number;     // cumulative extra rotation in degrees (0 | 90 | 180 | 270)
}

export async function renderRotatePageThumbs(
  file: File,
  onProgress: (pct: number, msg: string) => void
): Promise<RotatePage[]> {
  onProgress(5, 'Loading PDF renderer…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: RotatePage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pct = 10 + Math.round(((i - 1) / pdf.numPages) * 85);
    onProgress(pct, `Loading page ${i} of ${pdf.numPages}…`);

    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 0.35 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    const canvasContext = canvas.getContext('2d')!;
    await (page.render as any)({ canvas, viewport: vp, canvasContext }).promise;

    pages.push({ pageNum: i, thumbDataUrl: canvas.toDataURL('image/jpeg', 0.7), rotation: 0 });
  }

  onProgress(100, 'Done');
  return pages;
}

export async function rotatePdfPages(
  file: File,
  rotations: Record<number, number>,  // pageNum → cumulative degrees to add
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(10, 'Loading PDF library…');
  const { PDFDocument, degrees } = await import('pdf-lib');

  onProgress(30, 'Reading PDF…');
  const bytes = await file.arrayBuffer();
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  onProgress(60, 'Applying rotations…');
  const pageList = doc.getPages();
  pageList.forEach((page, idx) => {
    const extra = rotations[idx + 1] ?? 0;
    if (extra !== 0) {
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + extra) % 360));
    }
  });

  onProgress(90, 'Saving…');
  const saved = await doc.save();
  onProgress(100, 'Done');
  return new Blob([saved.buffer as ArrayBuffer], { type: 'application/pdf' });
}
