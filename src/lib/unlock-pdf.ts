export const FREE_FILE_LIMIT_MB = 50;

export type LockType = 'none' | 'owner' | 'user';

export interface DetectResult {
  lockType: LockType;
  reason: string;
}

export async function detectPdfLock(file: File): Promise<DetectResult> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();

  // Check for open-password (user password) via pdfjs
  try {
    await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  } catch (e: unknown) {
    const err = e as Record<string, unknown>;
    const name = String(err['name'] ?? '');
    const msg = String(err['message'] ?? '').toLowerCase();
    if (name === 'PasswordException' || msg.includes('password') || msg.includes('encrypted')) {
      return {
        lockType: 'user',
        reason: 'This PDF requires a password to open.',
      };
    }
    throw e;
  }

  // pdfjs opened fine — check for owner-only encryption with pdf-lib
  const { PDFDocument } = await import('pdf-lib');
  try {
    await PDFDocument.load(bytes);
    return { lockType: 'none', reason: 'This PDF does not appear to have permission restrictions.' };
  } catch {
    return {
      lockType: 'owner',
      reason: 'This PDF has permission restrictions — editing, copying, or printing may be disabled by the author.',
    };
  }
}

export async function unlockPermissions(
  file: File,
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(10, 'Loading PDF library…');
  const { PDFDocument } = await import('pdf-lib');

  onProgress(30, 'Loading PDF…');
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  onProgress(75, 'Removing restrictions…');
  const saved = await pdfDoc.save({ useObjectStreams: false });

  onProgress(100, 'Done');
  return new Blob([saved.buffer as ArrayBuffer], { type: 'application/pdf' });
}

export async function unlockWithPassword(
  file: File,
  password: string,
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(10, 'Verifying password…');
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const bytes = await file.arrayBuffer();

  let pdf: Awaited<ReturnType<(typeof pdfjsLib)['getDocument']>['promise']>;
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes), password }).promise;
  } catch (e: unknown) {
    const err = e as Record<string, unknown>;
    const name = String(err['name'] ?? '');
    const msg = String(err['message'] ?? '').toLowerCase();
    if (name === 'PasswordException' || msg.includes('password') || msg.includes('incorrect')) {
      throw new Error('Incorrect password. Please check and try again.');
    }
    throw e;
  }

  onProgress(20, `Rendering ${pdf.numPages} page(s) to images…`);

  const { PDFDocument } = await import('pdf-lib');
  const outputDoc = await PDFDocument.create();

  for (let i = 1; i <= pdf.numPages; i++) {
    const pct = 20 + Math.round(((i - 1) / pdf.numPages) * 65);
    onProgress(pct, `Rendering page ${i} of ${pdf.numPages}…`);

    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const vp2 = page.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    canvas.width = vp2.width;
    canvas.height = vp2.height;
    await page.render({ canvas, viewport: vp2 }).promise;

    const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = jpgDataUrl.split(',')[1];
    const imgBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

    const embeddedImg = await outputDoc.embedJpg(imgBytes);
    const newPage = outputDoc.addPage([vp1.width, vp1.height]);
    newPage.drawImage(embeddedImg, { x: 0, y: 0, width: vp1.width, height: vp1.height });
  }

  onProgress(90, 'Saving unlocked PDF…');
  const saved = await outputDoc.save();
  onProgress(100, 'Done');
  return new Blob([saved.buffer as ArrayBuffer], { type: 'application/pdf' });
}
