export const FREE_FILE_LIMIT_MB = 100;

/**
 * Encrypts a PDF file using RC4 128-bit encryption.
 * The file is processed locally in the user's browser.
 */
export async function protectPdf(
  file: File,
  password: string,
  onProgress: (pct: number, msg: string) => void
): Promise<Blob> {
  onProgress(10, 'Loading encryption module…');
  // Dynamically import to ensure compatibility with SSR/Astro build
  const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt-lite');

  onProgress(30, 'Reading PDF…');
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  onProgress(60, 'Applying password protection…');
  try {
    // encryptPDF takes (pdfBytes: Uint8Array, userPassword?: string, ownerPassword?: string)
    const encryptedBytes = await encryptPDF(bytes, password);

    onProgress(90, 'Creating encrypted PDF blob…');
    const blob = new Blob([encryptedBytes], { type: 'application/pdf' });
    onProgress(100, 'Done');
    return blob;
  } catch (err: any) {
    throw new Error(err?.message ?? 'Failed to encrypt PDF. The file may be corrupt or already encrypted.');
  }
}
