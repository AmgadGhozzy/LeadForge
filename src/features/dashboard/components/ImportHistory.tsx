import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { useImportSessions } from '@/features/search/hooks/use-import-sessions';
import { importApi } from '@/features/search/services/import-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Play, Download, Trash2, ExternalLink, Clock, MapPin, Database, Server, Search, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

export function ImportHistory({ projectId }: { projectId: string | undefined }) {
  const { data, isLoading } = useImportSessions(projectId);
  const sessions = data?.data || [];
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      setDeletingId(sessionId);
      return await importApi.deleteSession(sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-sessions', projectId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-businesses', projectId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-businesses', projectId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', projectId] });
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
    }
  });

  const handleExport = async (sessionId: string, keyword: string) => {
    setExportingId(sessionId);
    try {
      await importApi.exportSession(sessionId, keyword);
    } finally {
      setExportingId(null);
    }
  };

  if (isLoading) return null;
  if (sessions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Search Sessions</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sessions.slice(0, 6).map((session) => (
          <Card key={session.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    {session.keyword || 'Empty Query'}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                    <MapPin className="h-3 w-3" />
                    {session.city ? `${session.city}${session.country ? `, ${session.country}` : ''}` : 'No location specified'}
                  </div>
                </div>
                <Badge variant={session.status === 'COMPLETED' ? 'default' : 'secondary'} className="text-[10px]">
                  {session.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-2 flex-1">
              <div className="grid grid-cols-2 gap-y-2 text-sm mt-2">
                <div>
                  <span className="text-muted-foreground text-xs block">Imported</span>
                  <span className="font-medium">{session.total_imported}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Updated</span>
                  <span className="font-medium">{session.total_updated}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Skipped/Duplicate</span>
                  <span className="font-medium">{session.total_skipped}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block">Provider</span>
                  <span className="font-medium capitalize flex items-center gap-1">
                    <Server className="h-3 w-3 text-muted-foreground" />
                    {session.provider.replace('_', ' ')}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-3 mt-4 pt-4 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                </div>
                <div className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  ID: {session.id.split('-')[0]}
                </div>
              </div>
            </CardContent>
            <CardFooter className="pt-2 gap-2 justify-end border-t bg-muted/20">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2" 
                title="Export"
                disabled={exportingId === session.id}
                onClick={() => handleExport(session.id, session.keyword)}
              >
                {exportingId === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 px-2 text-destructive hover:text-destructive" 
                title="Delete"
                disabled={deletingId === session.id}
                onClick={() => {
                  if (confirm('Are you sure you want to delete this search session? This will also delete all businesses imported in this session.')) {
                    deleteMutation.mutate(session.id);
                  }
                }}
              >
                {deletingId === session.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" className="h-8 px-3 gap-1.5">
                <Play className="h-3.5 w-3.5" />
                Run Again
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
