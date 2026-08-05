import { CheckCircle2, Clock, AlertTriangle, Building2, Save, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ImportReport as ReportType } from '@/types/api';

interface ImportReportProps {
  report: ReportType;
}

export function ImportReport({ report }: ImportReportProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 text-primary mb-2">
        <CheckCircle2 className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Import Complete</h2>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.total_found}</div>
          </CardContent>
        </Card>

        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
              <Save className="h-4 w-4" />
              Imported
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{report.total_imported}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.total_updated}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Skipped (Dupes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.total_skipped}</div>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground flex items-center gap-1">
        <Clock className="h-4 w-4" />
        Completed in {(report.duration_ms / 1000).toFixed(1)} seconds
      </p>
    </div>
  );
}
