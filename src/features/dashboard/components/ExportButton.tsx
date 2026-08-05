import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileJson } from 'lucide-react';

interface ExportableRow {
  name: string;
  category?: string;
  address?: string;
  website?: string;
  lead_score?: number | null;
  sales_readiness?: number | null;
  priority_score?: number | null;
  priority_tier?: string | null;
  next_action?: string | null;
  next_action_reason?: string | null;
  urgency?: string | null;
  contacts?: { type: string; value: string }[];
}

interface ExportButtonProps {
  businesses: ExportableRow[];
  projectName?: string;
}

export function ExportButton({ businesses, projectName = 'leadforge' }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const buildExportData = () => {
    return businesses.map(b => ({
      Name: b.name,
      Category: b.category || '',
      Address: b.address || '',
      Website: b.website || '',
      'Lead Score': b.lead_score ?? '',
      'Sales Readiness': b.sales_readiness ?? '',
      'Priority Score': b.priority_score ?? '',
      'Priority Tier': b.priority_tier || '',
      'Next Action': b.next_action || '',
      'Next Action Reason': b.next_action_reason || '',
      Urgency: b.urgency || '',
      Emails: b.contacts?.filter(c => c.type === 'EMAIL').map(c => c.value).join('; ') || '',
      Phones: b.contacts?.filter(c => c.type === 'PHONE').map(c => c.value).join('; ') || '',
      WhatsApp: b.contacts?.filter(c => c.type === 'WHATSAPP').map(c => c.value).join('; ') || '',
    }));
  };

  const exportCSV = () => {
    setExporting(true);
    try {
      const data = buildExportData();
      if (data.length === 0) return;

      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => {
            const val = String(row[h as keyof typeof row] ?? '');
            // Escape commas and quotes
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(',')
        )
      ].join('\n');

      downloadFile(csvContent, `${projectName}_leads_${getDateStamp()}.csv`, 'text/csv');
    } finally {
      setExporting(false);
    }
  };

  const exportJSON = () => {
    setExporting(true);
    try {
      const data = buildExportData();
      const jsonContent = JSON.stringify(data, null, 2);
      downloadFile(jsonContent, `${projectName}_leads_${getDateStamp()}.json`, 'application/json');
    } finally {
      setExporting(false);
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getDateStamp = () => new Date().toISOString().split('T')[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={exporting || businesses.length === 0}>
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportCSV} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportJSON} className="gap-2 cursor-pointer">
          <FileJson className="h-4 w-4" />
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
