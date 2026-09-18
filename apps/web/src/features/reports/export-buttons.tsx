import * as React from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';

import { Button, toast } from '@/components/ui';
import { ApiRequestError } from '@/lib/api';

import {
  downloadReport,
  type ExportOptions,
  type ExportReport,
  type ReportFilterState,
} from './report-api';

/**
 * "Exportar CSV" / "Exportar PDF" for one tab, carrying that tab's current
 * filters. The server builds and names the file; the client only has to say
 * which report and which format.
 */
export function ExportButtons({
  report,
  filters,
  options,
  disabled = false,
}: {
  report: ExportReport;
  filters: ReportFilterState;
  options?: ExportOptions;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState<'csv' | 'pdf' | null>(null);

  const run = async (format: 'csv' | 'pdf') => {
    setBusy(format);
    try {
      await downloadReport(report, format, filters, options);
    } catch (error) {
      const message =
        error instanceof ApiRequestError
          ? error.message
          : 'Nao foi possivel gerar o ficheiro. Tente novamente.';
      toast.error('Exportacao falhou', message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        onClick={() => void run('csv')}
        loading={busy === 'csv'}
        disabled={disabled || busy !== null}
        leftIcon={<FileSpreadsheet />}
      >
        Exportar CSV
      </Button>
      <Button
        variant="outline"
        onClick={() => void run('pdf')}
        loading={busy === 'pdf'}
        disabled={disabled || busy !== null}
        leftIcon={<FileText />}
      >
        Exportar PDF
      </Button>
    </div>
  );
}

export default ExportButtons;
