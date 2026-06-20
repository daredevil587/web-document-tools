// FREE_FILE_LIMIT_MB — future Pro gate
export const FREE_FILE_LIMIT_MB = 50;
export const FREE_FILE_COUNT = 30;

export async function imagesToPdf(
  files: File[],
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(5, 'Loading PDF library…');
  const { PDFDocument } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const pct = 10 + Math.round((i / files.length) * 80);
    onProgress(pct, `Embedding image ${i + 1} of ${files.length}…`);

    const bytes = await files[i].arrayBuffer();
    const mime = files[i].type;

    let img;
    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      img = await pdfDoc.embedJpg(bytes);
    } else {
      // PNG and WebP — pdf-lib only accepts PNG directly; convert others via canvas
      if (mime === 'image/png') {
        img = await pdfDoc.embedPng(bytes);
      } else {
        // Convert WebP / GIF / BMP to PNG via Canvas
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);
        const pngBytes = await canvasToPng(url);
        URL.revokeObjectURL(url);
        img = await pdfDoc.embedPng(pngBytes);
      }
    }

    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  onProgress(96, 'Saving PDF…');
  const pdfBytes = await pdfDoc.save();

  onProgress(100, 'Done');
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

async function canvasToPng(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      canvas.toBlob(async (blob) => {
        if (!blob) { reject(new Error('Canvas conversion failed')); return; }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = url;
  });
}
