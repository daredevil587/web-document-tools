import { useState, useRef, useEffect } from 'react';
import type {
  Annotation, RenderedPage, FormField, TextItem,
  TextAnnotation, ImageAnnotation,
} from '../../lib/edit-pdf';
import { formatBytes, triggerDownload } from '../../lib/utils';

type AppState = 'upload' | 'loading' | 'extracting' | 'editing' | 'saving' | 'done' | 'error';
type ToolMode = 'text' | 'image' | 'signature' | 'select';

const FREE_MB = 50;
const SCALE = 1.8;

export default function EditPdfTool() {
  const [state, setState] = useState<AppState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [tool, setTool] = useState<ToolMode>('select');
  const [fontSize, setFontSize] = useState(12);
  const [textColor, setTextColor] = useState('#000000');
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [editingAnnId, setEditingAnnId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, msg: '' });
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingPos = useRef<{ x: number; y: number } | null>(null);
  const sigDrawing = useRef(false);

  const pageAnnotations = annotations.filter(a => a.pageIdx === currentPage);
  const pageTextItems = textItems.filter(t => t.pageIdx === currentPage);
  const modifiedCount = textItems.filter(t => t.currentText !== t.originalText).length;

  // ---- File handling ----
  const processFile = async (f: File) => {
    if (f.size > FREE_MB * 1024 * 1024) {
      setErrorMsg(`File too large. Max ${FREE_MB} MB.`);
      setState('error');
      return;
    }
    setFile(f);
    setState('loading');
    setProgress({ pct: 0, msg: 'Starting…' });
    try {
      const { renderPages, detectFormFields, extractTextItems } = await import('../../lib/edit-pdf');

      const rendered = await renderPages(f, SCALE, (pct, msg) =>
        setProgress({ pct: Math.round(pct * 0.6), msg })
      );
      setPages(rendered);

      setState('extracting');
      setProgress({ pct: 65, msg: 'Extracting text from PDF…' });

      const [fields, texts] = await Promise.all([
        detectFormFields(f),
        extractTextItems(f, rendered),
      ]);

      setFormFields(fields);
      setFormValues(Object.fromEntries(fields.map(ff => [ff.name, ''])));
      setTextItems(texts);
      setAnnotations([]);
      setCurrentPage(0);
      setSelectedAnnId(null);
      setEditingAnnId(null);
      setEditingItemId(null);
      setState('editing');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to load PDF.');
      setState('error');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === 'application/pdf') processFile(f);
  };

  // ---- Text item editing ----
  const updateTextItem = (id: string, newText: string) => {
    setTextItems(prev => prev.map(t => t.id === id ? { ...t, currentText: newText } : t));
  };

  // ---- Canvas click (add new annotation) ----
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Bail if click landed on a text overlay or existing annotation
    const target = e.target as HTMLElement;
    if (
      target.closest('.text-overlay') ||
      target.closest('.ann-text') ||
      target.closest('.ann-image')
    ) return;

    setEditingItemId(null);
    setEditingAnnId(null);

    if (tool === 'select') {
      setSelectedAnnId(null);
      return;
    }
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'text') {
      const id = crypto.randomUUID();
      setAnnotations(prev => [...prev, {
        id, type: 'text', pageIdx: currentPage,
        x, y, text: '', fontSize, color: textColor,
      }]);
      setSelectedAnnId(id);
      setEditingAnnId(id);
    } else if (tool === 'image') {
      pendingPos.current = { x, y };
      imageInputRef.current?.click();
    } else if (tool === 'signature') {
      pendingPos.current = { x, y };
      setShowSigModal(true);
    }
  };

  // ---- Annotation drag ----
  const startDrag = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (editingAnnId === id) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedAnnId(id);
    const ann = annotations.find(a => a.id === id);
    if (!ann) return;
    const startX = e.clientX, startY = e.clientY;
    const origX = ann.x, origY = ann.y;
    const onMove = (ev: PointerEvent) => {
      setAnnotations(prev => prev.map(a =>
        a.id === id ? { ...a, x: origX + ev.clientX - startX, y: origY + ev.clientY - startY } : a
      ));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnId === id) setSelectedAnnId(null);
    if (editingAnnId === id) setEditingAnnId(null);
  };

  // ---- Image upload ----
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const imgFile = e.target.files?.[0];
    const pos = pendingPos.current;
    if (!imgFile || !pos) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 200;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          const r = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        const id = crypto.randomUUID();
        setAnnotations(prev => [...prev, {
          id, type: 'image', pageIdx: currentPage,
          x: pos.x, y: pos.y, width: w, height: h, dataUrl,
        }]);
        setSelectedAnnId(id);
        pendingPos.current = null;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(imgFile);
    e.target.value = '';
  };

  // ---- Signature canvas ----
  const getSigPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = sigCanvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  };
  const sigPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault(); sigDrawing.current = true;
    const ctx = sigCanvasRef.current!.getContext('2d')!;
    const { x, y } = getSigPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };
  const sigPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sigDrawing.current) return; e.preventDefault();
    const ctx = sigCanvasRef.current!.getContext('2d')!;
    const { x, y } = getSigPos(e);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b'; ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const sigPointerUp = () => { sigDrawing.current = false; };
  const clearSigCanvas = () => {
    const c = sigCanvasRef.current;
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  };
  const useSig = () => {
    const c = sigCanvasRef.current;
    const pos = pendingPos.current;
    if (!c || !pos) return;
    const dataUrl = c.toDataURL('image/png');
    const id = crypto.randomUUID();
    setAnnotations(prev => [...prev, {
      id, type: 'image', pageIdx: currentPage,
      x: pos.x, y: pos.y,
      width: Math.round(c.width / 2),
      height: Math.round(c.height / 2),
      dataUrl,
    }]);
    setSelectedAnnId(id);
    pendingPos.current = null;
    setShowSigModal(false);
    clearSigCanvas();
  };

  // ---- Save ----
  const handleSave = async () => {
    if (!file) return;
    setState('saving');
    setProgress({ pct: 0, msg: 'Preparing…' });
    try {
      const { saveEdited } = await import('../../lib/edit-pdf');
      const blob = await saveEdited(
        file, annotations, textItems, formValues, pages,
        (pct, msg) => setProgress({ pct, msg })
      );
      setResultBlob(blob);
      setState('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to save PDF.');
      setState('error');
    }
  };

  const reset = () => {
    setState('upload');
    setFile(null); setPages([]); setTextItems([]);
    setAnnotations([]); setFormFields([]); setFormValues({});
    setResultBlob(null); setErrorMsg('');
    setSelectedAnnId(null); setEditingAnnId(null); setEditingItemId(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state !== 'editing') return;
      if (e.key === 'Escape') {
        setSelectedAnnId(null); setEditingAnnId(null);
        setEditingItemId(null); setShowSigModal(false);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnId && !editingAnnId) {
        e.preventDefault();
        deleteAnnotation(selectedAnnId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, selectedAnnId, editingAnnId]);

  const currentPageData = pages[currentPage];

  // ========== UPLOAD ==========
  if (state === 'upload') {
    return (
      <div>
        <div className="info-notice info-notice-green" style={{ marginBottom: 16 }}>
          <svg className="info-notice-icon" width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#14532d" strokeWidth="2"/>
            <line x1="12" y1="8" x2="12" y2="12" stroke="#14532d" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="16" r="1" fill="#14532d"/>
          </svg>
          <span>
            Upload a PDF — all text becomes clickable and editable directly, like in Word.
            You can also add new text, images, or a signature in blank areas.
          </span>
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="14 2 14 8 20 8" stroke="#6366f1" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="8" y1="13" x2="16" y2="13" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="8" y1="17" x2="13" y2="17" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h3>Drop your PDF here</h3>
          <p className="upload-sub">or click to browse — up to {FREE_MB} MB</p>
          <button className="btn-upload" type="button">Choose PDF</button>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
          style={{ display: 'none' }} onChange={handleFileInput} />
      </div>
    );
  }

  // ========== LOADING / EXTRACTING ==========
  if (state === 'loading' || state === 'extracting') {
    return (
      <div className="progress-state">
        <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
        <h3>{state === 'loading' ? 'Rendering PDF…' : 'Extracting editable text…'}</h3>
        <p>{progress.msg}</p>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${progress.pct}%` }}/>
        </div>
        <div className="progress-footer">
          <span>{progress.msg}</span>
          <span className="progress-pct">{progress.pct}%</span>
        </div>
      </div>
    );
  }

  // ========== SAVING ==========
  if (state === 'saving') {
    return (
      <div className="progress-state">
        <div className="spinner-wrap"><div className="spinner"/><div className="spinner-inner"/></div>
        <h3>Saving edited PDF…</h3>
        <p>{progress.msg}</p>
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${progress.pct}%` }}/>
        </div>
        <div className="progress-footer">
          <span>{progress.msg}</span>
          <span className="progress-pct">{progress.pct}%</span>
        </div>
      </div>
    );
  }

  // ========== DONE ==========
  if (state === 'done' && resultBlob && file) {
    const outName = file.name.replace(/\.pdf$/i, '-edited.pdf');
    return (
      <div className="success-state">
        <div className="success-icon">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" strokeWidth="1.5"/>
            <polyline points="8 12 11 15 16 9" stroke="#16a34a" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3>PDF saved!</h3>
        {modifiedCount > 0 && (
          <p>{modifiedCount} text edit{modifiedCount !== 1 ? 's' : ''} applied.</p>
        )}
        <div className="success-actions">
          <button className="btn-download" onClick={() => triggerDownload(resultBlob, outName)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#fff"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="7 10 12 15 17 10" stroke="#fff" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="15" x2="12" y2="3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Download {outName}
          </button>
          <button className="btn-another" onClick={reset}>Edit another PDF</button>
        </div>
      </div>
    );
  }

  // ========== ERROR ==========
  if (state === 'error') {
    return (
      <div className="error-state">
        <div className="error-icon">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.5"/>
            <line x1="15" y1="9" x2="9" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="9" y1="9" x2="15" y2="15" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        <h3>Something went wrong</h3>
        <p>{errorMsg}</p>
        <button className="btn-action" onClick={reset}>Try Again</button>
      </div>
    );
  }

  // ========== EDITING ==========
  return (
    <div>
      {/* Signature modal */}
      {showSigModal && (
        <div className="sig-modal-overlay"
          onClick={() => { setShowSigModal(false); clearSigCanvas(); }}>
          <div className="sig-modal" onClick={e => e.stopPropagation()}>
            <h3>Draw Signature</h3>
            <p className="sig-modal-sub">Draw below, then click Use Signature</p>
            <div className="sig-canvas-wrap">
              <canvas ref={sigCanvasRef} className="sig-canvas" width={460} height={160}
                onPointerDown={sigPointerDown} onPointerMove={sigPointerMove}
                onPointerUp={sigPointerUp}/>
            </div>
            <div className="sig-actions">
              <button className="btn-sig-clear" onClick={clearSigCanvas}>Clear</button>
              <button className="btn-sig-use" onClick={useSig}>Use Signature</button>
            </div>
            <button className="btn-sig-cancel"
              onClick={() => { setShowSigModal(false); clearSigCanvas(); }}>Cancel</button>
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf"
        style={{ display: 'none' }} onChange={handleFileInput} />
      <input ref={imageInputRef} type="file" accept="image/*"
        style={{ display: 'none' }} onChange={handleImageUpload} />

      {/* File info */}
      <div className="file-item" style={{ marginBottom: 12 }}>
        <svg className="file-item-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="file-item-info">
          <div className="file-item-name">{file?.name}</div>
          <div className="file-item-size">
            {file ? formatBytes(file.size) : ''} · {pages.length} page{pages.length !== 1 ? 's' : ''}
            {' · '}
            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
              {textItems.length} editable text block{textItems.length !== 1 ? 's' : ''}
            </span>
            {modifiedCount > 0 && (
              <span style={{ color: '#16a34a', fontWeight: 700 }}> · {modifiedCount} edited</span>
            )}
          </div>
        </div>
        <button className="btn-another" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }}
          onClick={reset}>Change</button>
      </div>

      {/* Edit mode hint */}
      <div className="info-notice info-notice-green" style={{ marginBottom: 12, fontSize: '0.8rem', padding: '9px 14px' }}>
        <svg className="info-notice-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
            stroke="#14532d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
            stroke="#14532d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>
          <strong>Click any text on the page to edit it.</strong> Hover to see clickable text blocks.
          Use the toolbar below to add new text, images, or a signature in blank areas.
        </span>
      </div>

      {/* Toolbar */}
      <div className="editor-toolbar">
        <span className="toolbar-label">Add:</span>
        {(['text', 'image', 'signature'] as ToolMode[]).map(t => (
          <button key={t} className={`toolbar-btn${tool === t ? ' active' : ''}`}
            onClick={() => setTool(t)}>
            {t === 'text' && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <polyline points="4 7 4 4 20 4 20 7" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="9" y1="20" x2="15" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            )}
            {t === 'image' && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {t === 'signature' && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M3 17c2-1 4-3 5-5s2-4 3-4 2 2 2 4-1 4-1 5 1 2 2 1 3-3 4-5"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}

        <button className={`toolbar-btn${tool === 'select' ? ' active' : ''}`}
          onClick={() => setTool('select')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M5 3l14 9-7 1-3 7-4-17z" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Select
        </button>

        {tool === 'text' && (
          <>
            <div className="toolbar-divider"/>
            <span className="toolbar-label">Size:</span>
            <input className="toolbar-input" type="number" min={8} max={72}
              value={fontSize} onChange={e => setFontSize(Number(e.target.value))}/>
            <span className="toolbar-label">Color:</span>
            <input className="toolbar-color" type="color"
              value={textColor} onChange={e => setTextColor(e.target.value)}/>
          </>
        )}

        {selectedAnnId && (
          <>
            <div className="toolbar-divider"/>
            <button className="toolbar-btn danger" onClick={() => deleteAnnotation(selectedAnnId)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Delete
            </button>
          </>
        )}

        <div style={{ flex: 1 }}/>

        <button className="btn-action"
          style={{ width: 'auto', padding: '7px 20px', fontSize: '0.88rem' }}
          onClick={handleSave}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="17 21 17 13 7 13 7 21" stroke="#fff" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="7 3 7 8 15 8" stroke="#fff" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Save PDF
        </button>
      </div>

      {/* Editor canvas */}
      <div className="editor-canvas-scroll"
        onClick={e => { if (e.target === e.currentTarget) { setEditingItemId(null); setSelectedAnnId(null); } }}>
        {currentPageData && (
          <div
            ref={containerRef}
            className="editor-page-container"
            style={{ cursor: tool === 'select' || tool === 'text' && false ? 'default' : tool === 'text' ? 'text' : 'crosshair' }}
            onClick={handleCanvasClick}
          >
            <img
              src={currentPageData.dataUrl}
              className="editor-page-img"
              alt={`Page ${currentPage + 1}`}
              width={currentPageData.canvasWidth}
              height={currentPageData.canvasHeight}
              draggable={false}
            />

            {/* ── EDITABLE TEXT OVERLAYS (existing PDF text) ── */}
            {pageTextItems.map(item => {
              const isEditing = editingItemId === item.id;
              const isModified = item.currentText !== item.originalText;

              return (
                <div
                  key={item.id}
                  className={`text-overlay${isEditing ? ' editing' : ''}${isModified ? ' modified' : ''}`}
                  style={{
                    left: item.canvasX,
                    top: item.canvasY,
                    fontSize: item.canvasFontSize,
                    height: item.canvasFontSize * 1.5,
                    width: isEditing
                      ? Math.max(item.canvasWidth, item.currentText.length * item.canvasFontSize * 0.6 + 16)
                      : item.canvasWidth || item.canvasFontSize * item.originalText.length * 0.55,
                    color: item.color,
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    setEditingItemId(item.id);
                    setSelectedAnnId(null);
                    setEditingAnnId(null);
                    setTool('select');
                  }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      onFocus={e => e.target.select()}
                      value={item.currentText}
                      style={{ fontSize: item.canvasFontSize, width: '100%', color: 'inherit' }}
                      onChange={e => updateTextItem(item.id, e.target.value)}
                      onBlur={() => setEditingItemId(null)}
                      onKeyDown={e => {
                        if (e.key === 'Escape' || e.key === 'Enter') {
                          e.preventDefault();
                          setEditingItemId(null);
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="text-overlay-content">
                      {isModified ? item.currentText : item.originalText}
                    </span>
                  )}
                </div>
              );
            })}

            {/* ── NEW ANNOTATIONS (added via toolbar) ── */}
            {pageAnnotations.map(ann => {
              const isSelected = selectedAnnId === ann.id;
              const isEditing = editingAnnId === ann.id;

              if (ann.type === 'text') {
                const a = ann as TextAnnotation;
                return (
                  <div key={a.id}
                    className={`ann-text${isSelected ? ' selected' : ''}`}
                    style={{
                      left: a.x, top: a.y,
                      fontSize: a.fontSize * SCALE,
                      color: a.color,
                      cursor: isEditing ? 'text' : 'move',
                    }}
                    onPointerDown={e => { if (!isEditing) startDrag(e, a.id); }}
                    onClick={e => { e.stopPropagation(); setSelectedAnnId(a.id); }}
                    onDoubleClick={e => { e.stopPropagation(); setSelectedAnnId(a.id); setEditingAnnId(a.id); }}
                  >
                    {isEditing ? (
                      <textarea autoFocus value={a.text} rows={1}
                        style={{ fontSize: a.fontSize * SCALE, color: a.color }}
                        onChange={ev => {
                          const val = ev.target.value;
                          setAnnotations(prev => prev.map(x => x.id === a.id ? { ...x, text: val } : x));
                          ev.target.style.height = 'auto';
                          ev.target.style.height = ev.target.scrollHeight + 'px';
                        }}
                        onBlur={() => setEditingAnnId(null)}
                        onKeyDown={ev => { if (ev.key === 'Escape') setEditingAnnId(null); }}
                        onClick={ev => ev.stopPropagation()}/>
                    ) : (
                      <span style={{ whiteSpace: 'pre' }}>{a.text || <em style={{ opacity: 0.4 }}>type…</em>}</span>
                    )}
                    {isSelected && !isEditing && (
                      <button className="ann-delete-btn"
                        onClick={ev => { ev.stopPropagation(); deleteAnnotation(a.id); }}>×</button>
                    )}
                  </div>
                );
              }

              if (ann.type === 'image') {
                const a = ann as ImageAnnotation;
                return (
                  <div key={a.id}
                    className={`ann-image${isSelected ? ' selected' : ''}`}
                    style={{ left: a.x, top: a.y, width: a.width, height: a.height }}
                    onPointerDown={e => startDrag(e, a.id)}
                    onClick={e => { e.stopPropagation(); setSelectedAnnId(a.id); }}>
                    <img src={a.dataUrl} alt="annotation" draggable={false}/>
                    {isSelected && (
                      <button className="ann-delete-btn"
                        onClick={ev => { ev.stopPropagation(); deleteAnnotation(a.id); }}>×</button>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>

      {/* Page navigation */}
      {pages.length > 1 && (
        <div className="page-nav">
          <button className="page-nav-btn" disabled={currentPage === 0}
            onClick={() => { setCurrentPage(p => p - 1); setEditingItemId(null); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polyline points="15 18 9 12 15 6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Prev
          </button>
          <span className="page-nav-info">Page {currentPage + 1} / {pages.length}</span>
          <button className="page-nav-btn" disabled={currentPage === pages.length - 1}
            onClick={() => { setCurrentPage(p => p + 1); setEditingItemId(null); }}>
            Next
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <polyline points="9 18 15 12 9 6" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
        Click any text to edit · Enter/Escape to confirm · Toolbar to add new content
      </p>

      {/* AcroForm fields panel */}
      {formFields.length > 0 && (
        <div className="form-fields-panel">
          <div className="form-fields-header">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="var(--primary)" strokeWidth="2"/>
              <line x1="3" y1="10" x2="21" y2="10" stroke="var(--primary)" strokeWidth="1.5"/>
            </svg>
            Fill Form Fields ({formFields.length} detected)
          </div>
          <div className="form-fields-body">
            {formFields.map(ff => (
              <div key={ff.name} className="form-field-row">
                <label className="form-field-label">
                  {ff.name}<span style={{ opacity: 0.6, fontWeight: 400 }}> ({ff.fieldType})</span>
                </label>
                <input className="form-field-input" type="text"
                  value={formValues[ff.name] ?? ''}
                  placeholder={`Enter ${ff.name}…`}
                  onChange={e => setFormValues(prev => ({ ...prev, [ff.name]: e.target.value }))}/>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
