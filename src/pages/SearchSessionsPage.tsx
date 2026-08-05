import { useParams } from 'react-router-dom';
import { ImportHistory } from '@/features/dashboard/components/ImportHistory';

export function SearchSessionsPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Search Sessions</h1>
        <p className="text-muted-foreground mt-2">
          Review recent data extraction and analysis runs.
        </p>
      </div>

      <div className="space-y-4">
        <ImportHistory projectId={projectId} />
      </div>
    </div>
  );
}
