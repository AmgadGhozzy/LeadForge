import { useParams } from 'react-router-dom';
import { SearchForm } from '@/features/search/components/SearchForm';
import { ImportProgress } from '@/features/search/components/ImportProgress';
import { ImportReport } from '@/features/search/components/ImportReport';
import { useImportBusinesses } from '@/features/search/hooks/use-import-businesses';

export function SearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const importMutation = useImportBusinesses();

  const handleSearch = (data: { keyword: string; city: string; country: string }) => {
    if (!projectId) return;
    
    importMutation.mutate({
      project_id: projectId,
      provider: 'GOOGLE_PLACES',
      keyword: data.keyword,
      city: data.city,
      country: data.country,
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Import</h1>
        <p className="text-muted-foreground mt-2">
          Find and import businesses into your project directly from Google Places.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <SearchForm 
            onSubmit={handleSearch} 
            isLoading={importMutation.isPending} 
          />
        </div>

        <div>
          {importMutation.isPending && <ImportProgress />}
          {importMutation.isSuccess && importMutation.data?.data && (
            <ImportReport report={importMutation.data.data} />
          )}
          {importMutation.isError && (
            <div className="p-4 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
              <p className="font-semibold">Import Failed</p>
              <p className="text-sm mt-1">{importMutation.error.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
