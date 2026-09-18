import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { toast } from '@/components/ui';
import { api } from '@/lib/api';
import { errorMessage } from './query-error';
import type { ReceiptTextResponse } from '../types';

/**
 * The browser print dialog is the only printer this app has. index.css hides
 * everything except #receipt-print at 80mm, so reprinting is: fetch the text the
 * server already renders for the thermal printer, drop it into that node, print.
 */
interface PrintJob {
  text: string;
  /** Bumped on every request so printing the same receipt twice still fires. */
  nonce: number;
}

export function useReceiptPrint(saleId: string | undefined) {
  const [job, setJob] = useState<PrintJob | null>(null);
  const nonce = useRef(0);

  useEffect(() => {
    if (!job) return;
    // One frame so the node is laid out before the dialog freezes the page.
    const frame = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(frame);
  }, [job]);

  const queue = useCallback((text: string) => {
    nonce.current += 1;
    setJob({ text, nonce: nonce.current });
  }, []);

  const mutation = useMutation({
    mutationFn: () => api.get<ReceiptTextResponse>(`/api/sales/${saleId ?? ''}/receipt-text`),
    onSuccess: (data) => queue(data.text),
    onError: (error) => toast.error('Nao foi possivel imprimir', errorMessage(error)),
  });

  const { mutate } = mutation;
  const print = useCallback(() => {
    if (!saleId) return;
    mutate();
  }, [saleId, mutate]);

  return { text: job?.text ?? null, print, printText: queue, printing: mutation.isPending };
}

/** The hidden node the print stylesheet targets. */
export function ReceiptPrint({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div id="receipt-print" className="hidden print:block" aria-hidden="true">
      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-tight">{text}</pre>
    </div>
  );
}

export default ReceiptPrint;
