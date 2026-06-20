import { useState, useRef, useCallback, useEffect } from 'react';
import { renderRedactPageThumbs, redactPdf, FREE_FILE_LIMIT_MB, type RedactionRect, type RenderedPage } from '../../lib/redact-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type AppState = 'upload' | 'loading' | 'editing' | 'processing' | 'done' | 'error';

export default function RedactPdfTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [redactions, setRedactions] = useState<Record<number, RedactionRect[]>>({});
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number; y: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (f.type !== 'application/pdf') {
      setErrorMsg('Please select a PDF file.');
      setState('error');
      return;
    }
    if (f.size > FREE_FILE_LIMIT_MB * 1024 * 1024) {
      setErrorMsg(`File exceeds ${FREE_FILE_LIMIT_MB} MB limit.`);
      setState('error');
      return;
    }
    setFile(f);
    setState('loading');
    setProgress(0);
    setProgressMsg('Rendering document pages…');
    try {
      const thumbs = await renderRedactPageThumbs(f, (pct, msg) => {
        setProgress(pct);
        setProgressMsg(msg);
      });
      setPages(thumbs);
      setRedactions({});
      setCurrentPage(0);
      setState('editing');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not render PDF.');
      setState('error');
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // Drawing handlers
  const handlePointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left click
    if (!editorContainerRef.current) return;

    const rect = editorContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setDrawStart({ x, y });
    setCurrentMousePos({ x, y });
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !editorContainerRef.current) return;

    const rect = editorContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    setCurrentMousePos({ x, y });
  };

  const handlePointerUp = () => {
    if (!isDrawing || !drawStart || !currentMousePos || !editorContainerRef.current) return;
    setIsDrawing(false);

    const rect = editorContainerRef.current.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    const startX = drawStart.x;
    const startY = drawStart.y;
    const currentX = currentMousePos.x;
    const currentY = currentMousePos.y;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(startX - currentX);
    const height = Math.abs(startY - currentY);

    // Only record rectangles that are large enough to avoid accidental clicks
    if (width > 5 && height > 5) {
      const newRect: RedactionRect = {
        id: crypto.randomUUID(),
        x: left / W,
        y: top / H,
        w: width / W,
        h: height / H,
      };

      setRedactions(prev => {
        const pageRects = prev[currentPage] ?? [];
        return {
          ...prev,
          [currentPage]: [...pageRects, newRect],
        };
      });
    }

    setDrawStart(null);
    setCurrentMousePos(null);
  };

  const deleteRect = (rectId: string) => {
    setRedactions(prev => {
      const pageRects = prev[currentPage] ?? [];
      return {
        ...prev,
        [currentPage]: pageRects.filter(r => r.id !== rectId),
      };
    });
  };

  const clearCurrentPageRedactions = () => {
    setRedactions(prev => ({
      ...prev,
      [currentPage]: [],
    }));
  };

  const totalRedactionsCount = Object.values(redactions).reduce((acc, curr) => acc + curr.length, 0);

  const handleApplyRedactions = async () => {
    if (!file) return;
    setState('processing');
    setProgress(0);
    setProgressMsg('Initializing PDF compiler…');

    try {
      const blob = await redactPdf(file, redactions, (pct, msg) => {
        setProgress(pct);
        setProgressMsg(msg);
      });
      setResultBlob(blob);
      setState('done');
      triggerDownload(blob, file.name.replace(/\.pdf$/i, '') + '-redacted.pdf');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not apply redactions.');
      setState('error');
    }
  };

  const reset = () => {
    setFile(null);
    setPages([]);
    setRedactions({});
    setResultBlob(null);
    setErrorMsg('');
    setState('upload');
  };

  // Keyboard shortcut listener to clear selection on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawing) {
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentMousePos(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing]);

  // Compute bounding box for drawing preview
  const getPreviewStyle = () => {
    if (!drawStart || !currentMousePos) return { display: 'none' };
    const left = Math.min(drawStart.x, currentMousePos.x);
    const top = Math.min(drawStart.y, currentMousePos.y);
    const width = Math.abs(drawStart.x - currentMousePos.x);
    const height = Math.abs(drawStart.y - currentMousePos.y);

    return {
      position: 'absolute' as const,
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      background: 'rgba(0, 0, 0, 0.4)',
      border: '1.5px dashed #f43f5e',
      pointerEvents: 'none' as const,
    };
  };

  const currentPageData = pages[currentPage];
  const currentPageRects = redactions[currentPage] ?? [];

  return (
    <div>
      {state === 'upload' && (
        <div>
          <div className="info-notice info-notice-green" style={{ marginBottom: 20 }}>
            <svg className="info-notice-icon" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#14532d" strokeWidth="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke="#14532d" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="12" cy="16" r="1" fill="#14532d"/>
            </svg>
            <div>
              <strong>Responsible Redaction.</strong> Drawing simple black boxes inside regular PDF editors leaves
              the underlying text copyable. This tool **physically rasterizes and flattens** redacted pages, deleting
              the hidden characters forever. Processing is 100% local.
            </div>
          </div>

          <div
            className={`upload-area${dragOver ? ' dragover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#6366f1" strokeWidth="1.5"/>
                <line x1="9" y1="9" x2="15" y2="15" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
                <line x1="15" y1="9" x2="9" y2="15" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h3>Drop your PDF here</h3>
            <p className="upload-sub">or click to browse — up to {FREE_FILE_LIMIT_MB} MB</p>
            <button className="btn-upload" type="button">Choose PDF File</button>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
            style={{ display: 'none' }} onChange={handleFileInput} />
        </div>
      )}

      {(state === 'loading' || state === 'processing') && (
        <div className="progress-state">
          <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
          <h3>{state === 'loading' ? 'Loading PDF pages…' : 'Applying sanitization…'}</h3>
          <p>{progressMsg}</p>
          <div className="progress-bar-wrap">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-footer">
            <span>Please wait</span>
            <span className="progress-pct">{progress}%</span>
          </div>
        </div>
      )}

      {state === 'editing' && file && currentPageData && (
        <div>
          {/* Editor Header Toolbar */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
            <strong style={{ fontSize: '0.92rem', flex: 1, minWidth: '120px' }}>
              {totalRedactionsCount} total blackout zone{totalRedactionsCount !== 1 ? 's' : ''}
            </strong>
            
            <button className="toolbar-btn danger" onClick={clearCurrentPageRedactions} disabled={currentPageRects.length === 0}>
              Clear Page
            </button>

            <button
              className="btn-action"
              style={{ padding: '9px 20px', fontSize: '0.86rem' }}
              onClick={handleApplyRedactions}
              disabled={totalRedactionsCount === 0}
            >
              Apply &amp; Redact PDF
            </button>
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>
            🖱️ **Click &amp; Drag** on the page preview to draw black redaction boxes over sensitive text or images.
          </p>

          {/* Interactive Page Container */}
          <div style={{ display: 'flex', justifyContent: 'center', background: 'var(--surface2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
            <div
              ref={editorContainerRef}
              style={{
                position: 'relative',
                cursor: 'crosshair',
                boxShadow: 'var(--shadow)',
                userSelect: 'none',
                maxWidth: '100%',
              }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
            >
              <img
                src={currentPageData.dataUrl}
                alt={`Page ${currentPage + 1}`}
                draggable={false}
                style={{ display: 'block', maxWidth: '100%', height: 'auto', pointerEvents: 'none' }}
              />

              {/* Drawn Redaction Rects list */}
              {currentPageRects.map(rect => (
                <div
                  key={rect.id}
                  style={{
                    position: 'absolute',
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.w * 100}%`,
                    height: `${rect.h * 100}%`,
                    background: '#000000',
                    border: '1px dashed #ef4444',
                    pointerEvents: 'auto',
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRect(rect.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '-10px',
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    }}
                    title="Remove redaction"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Drawing Preview indicator */}
              <div style={getPreviewStyle()} />
            </div>
          </div>

          {/* Page Nav */}
          {pages.length > 1 && (
            <div className="page-nav" style={{ marginTop: '16px' }}>
              <button
                className="page-nav-btn"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <polyline points="15 18 9 12 15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Prev
              </button>
              <span className="page-nav-info">Page {currentPage + 1} of {pages.length}</span>
              <button
                className="page-nav-btn"
                disabled={currentPage === pages.length - 1}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Next
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <polyline points="9 18 15 12 9 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          )}

          <button className="btn-another" onClick={reset} style={{ marginTop: '16px', width: '100%' }}>
            Choose Different PDF
          </button>
        </div>
      )}

      {state === 'done' && resultBlob && file && (
        <div className="success-state">
          <div className="success-icon">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
              <polyline points="8 12 11 15 16 9" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3>PDF Redacted Successfully!</h3>
          <p>Redacted pages were rasterized to images, permanently deleting hidden characters underneath.</p>
          <div className="success-actions">
            <button
              className="btn-download"
              onClick={() => triggerDownload(resultBlob, file.name.replace(/\.pdf$/i, '') + '-redacted.pdf')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Download Redacted PDF
            </button>
            <button className="btn-another" onClick={reset}>Redact Another PDF</button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="error-state">
          <div className="error-icon">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.5"/>
              <line x1="15" y1="9" x2="9" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="9" y1="9" x2="15" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h3>Redaction Failed</h3>
          <p>{errorMsg}</p>
          <button className="btn-action" onClick={reset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
