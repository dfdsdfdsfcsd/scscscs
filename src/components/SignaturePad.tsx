import { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Eraser, Check } from 'lucide-react';

export interface SignaturePadHandle {
  clear: () => void;
  toDataURL: () => string | null;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  height?: number;
  onConfirm?: (dataUrl: string) => void;
  label?: string;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ height = 180, onConfirm, label = 'Assinatura' }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    const getCtx = useCallback((): CanvasRenderingContext2D | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
      return ctx;
    }, []);

    const getPos = (e: React.PointerEvent): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      if (confirmed) return;
      drawingRef.current = true;
      lastPointRef.current = getPos(e);
      canvasRef.current?.setPointerCapture(e.pointerId);
    };

    const move = (e: React.PointerEvent) => {
      if (!drawingRef.current || confirmed) return;
      e.preventDefault();
      const ctx = getCtx();
      if (!ctx) return;
      const pos = getPos(e);
      const last = lastPointRef.current;
      if (last) {
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
      lastPointRef.current = pos;
      if (!hasDrawn) setHasDrawn(true);
    };

    const end = (e: React.PointerEvent) => {
      e.preventDefault();
      drawingRef.current = false;
      lastPointRef.current = null;
    };

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
      setConfirmed(false);
    }, []);

    const toDataURL = useCallback((): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    }, []);

    const isEmpty = useCallback((): boolean => !hasDrawn, [hasDrawn]);

    useImperativeHandle(ref, () => ({ clear, toDataURL, isEmpty }), [clear, toDataURL, isEmpty]);

    const handleConfirm = () => {
      if (!hasDrawn) return;
      const url = toDataURL();
      if (url) {
        setConfirmed(true);
        onConfirm?.(url);
      }
    };

    useEffect(() => {
      getCtx();
    }, [getCtx]);

    return (
      <div className="space-y-2">
        <label className="label">{label}</label>
        <div className={`relative rounded-xl border-2 ${confirmed ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200 dark:border-slate-700'} overflow-hidden`}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: `${height}px`, touchAction: 'none', cursor: confirmed ? 'default' : 'crosshair' }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          {!hasDrawn && !confirmed && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-sm text-slate-300">Assine aqui com mouse, dedo ou caneta</span>
            </div>
          )}
          {confirmed && (
            <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-emerald-600 bg-white/80 dark:bg-slate-800/80 px-2 py-1 rounded-lg">
              <Check className="h-3 w-3" /> Assinatura confirmada
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={clear} disabled={confirmed} className="btn-secondary text-xs disabled:opacity-40">
            <Eraser className="h-3 w-3" /> Limpar
          </button>
          <button type="button" onClick={handleConfirm} disabled={!hasDrawn || confirmed} className="btn-primary text-xs disabled:opacity-40">
            <Check className="h-3 w-3" /> Confirmar assinatura
          </button>
        </div>
        {confirmed && (
          <p className="text-xs text-amber-600">Assinatura confirmada. Para alterar, limpe e desenhe novamente antes de confirmar.</p>
        )}
      </div>
    );
  }
);

SignaturePad.displayName = 'SignaturePad';
