export const FREE_FILE_LIMIT_MB = 100;

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  creationDate: string;
  modificationDate: string;
}

/**
 * Reads standard metadata from a PDF file.
 */
export async function readPdfMetadata(file: File): Promise<PdfMetadata> {
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  const keywordsVal = pdfDoc.getKeywords();
  let keywordsStr = '';
  if (keywordsVal) {
    keywordsStr = Array.isArray(keywordsVal) ? keywordsVal.join(', ') : keywordsVal;
  }

  // Format dates to ISO format without milliseconds if possible, or fallback
  const formatDateStr = (d?: Date) => {
    if (!d) return '';
    try {
      return d.toISOString().split('.')[0] + 'Z';
    } catch {
      return '';
    }
  };

  return {
    title: pdfDoc.getTitle() ?? '',
    author: pdfDoc.getAuthor() ?? '',
    subject: pdfDoc.getSubject() ?? '',
    keywords: keywordsStr,
    creator: pdfDoc.getCreator() ?? '',
    producer: pdfDoc.getProducer() ?? '',
    creationDate: formatDateStr(pdfDoc.getCreationDate()),
    modificationDate: formatDateStr(pdfDoc.getModificationDate()),
  };
}

/**
 * Updates PDF metadata in both the standard Info dictionary and removes XMP streams if requested.
 */
export async function updatePdfMetadata(
  file: File,
  newMeta: Partial<PdfMetadata>,
  sanitizeXmp: boolean
): Promise<Blob> {
  const { PDFDocument, PDFName } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

  // Update or delete fields from Info Dictionary
  if (newMeta.title !== undefined) {
    if (!newMeta.title) {
      (pdfDoc as any).setTitle(undefined);
    } else {
      pdfDoc.setTitle(newMeta.title);
    }
  }

  if (newMeta.author !== undefined) {
    if (!newMeta.author) {
      (pdfDoc as any).setAuthor(undefined);
    } else {
      pdfDoc.setAuthor(newMeta.author);
    }
  }

  if (newMeta.subject !== undefined) {
    if (!newMeta.subject) {
      (pdfDoc as any).setSubject(undefined);
    } else {
      pdfDoc.setSubject(newMeta.subject);
    }
  }

  if (newMeta.keywords !== undefined) {
    if (!newMeta.keywords) {
      (pdfDoc as any).setKeywords(undefined);
    } else {
      const list = newMeta.keywords
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      pdfDoc.setKeywords(list);
    }
  }

  if (newMeta.creator !== undefined) {
    if (!newMeta.creator) {
      (pdfDoc as any).setCreator(undefined);
    } else {
      pdfDoc.setCreator(newMeta.creator);
    }
  }

  if (newMeta.producer !== undefined) {
    if (!newMeta.producer) {
      (pdfDoc as any).setProducer(undefined);
    } else {
      pdfDoc.setProducer(newMeta.producer);
    }
  }

  if (newMeta.creationDate !== undefined) {
    if (!newMeta.creationDate) {
      (pdfDoc as any).setCreationDate(undefined);
    } else {
      const d = new Date(newMeta.creationDate);
      if (isNaN(d.getTime())) {
        throw new Error('Invalid Creation Date. Please use YYYY-MM-DDTHH:MM:SSZ format.');
      }
      pdfDoc.setCreationDate(d);
    }
  }

  if (newMeta.modificationDate !== undefined) {
    if (!newMeta.modificationDate) {
      (pdfDoc as any).setModificationDate(undefined);
    } else {
      const d = new Date(newMeta.modificationDate);
      if (isNaN(d.getTime())) {
        throw new Error('Invalid Modification Date. Please use YYYY-MM-DDTHH:MM:SSZ format.');
      }
      pdfDoc.setModificationDate(d);
    }
  }

  // Deep sanitize XMP XML stream from document catalog
  if (sanitizeXmp) {
    const catalog = pdfDoc.catalog;
    if (catalog.has(PDFName.of('Metadata'))) {
      catalog.delete(PDFName.of('Metadata'));
    }
  }

  const savedBytes = await pdfDoc.save();
  return new Blob([savedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
