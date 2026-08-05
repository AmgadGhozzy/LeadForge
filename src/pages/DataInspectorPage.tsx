import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Database, Activity, Bot, Network, Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function DataInspectorPage() {
  const { projectId, businessId } = useParams();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['business-profile-inspector', businessId],
    queryFn: async () => {
      // For Phase 2.1, we simulate fetching the CanonicalProfile by combining the raw tables.
      // Once the ProfileBuilder is exposed via a dedicated endpoint, we'll call that instead.
      const { data: business } = await supabase
        .from('businesses')
        .select('*, website_analyses(*, analysis_items(*))')
        .eq('id', businessId)
        .single();
      
      const { data: contacts } = await supabase.from('contacts').select('*').eq('business_id', businessId);
      const { data: technologies } = await supabase.from('business_technologies').select('*').eq('business_id', businessId);
      const { data: pages } = await supabase.from('website_pages').select('url, page_type, title').eq('business_id', businessId);

      return {
        identity: business,
        contacts,
        technologies,
        pages,
        analysis: business?.website_analyses?.[0] || null
      };
    }
  });

  if (isLoading) return <div className="p-10 flex justify-center">Loading Inspector...</div>;
  if (!profile) return <div className="p-10">Business not found</div>;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6 overflow-hidden flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between space-y-2 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/projects/${projectId}/lead/${businessId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Data Inspector</h2>
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Pipeline debugging view for {profile.identity?.name}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 px-3 py-1 rounded-md text-sm font-medium">
            Knowledge Score: 85%
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col border rounded-lg bg-card">
        <Tabs defaultValue="raw" className="flex-1 flex flex-col h-full w-full">
          <div className="border-b px-4 py-2 shrink-0 bg-muted/30">
            <TabsList>
              <TabsTrigger value="raw" className="gap-2"><Database className="h-4 w-4"/> Raw Data</TabsTrigger>
              <TabsTrigger value="normalized" className="gap-2"><Network className="h-4 w-4"/> Normalized</TabsTrigger>
              <TabsTrigger value="facts" className="gap-2"><Activity className="h-4 w-4"/> Engine Facts</TabsTrigger>
              <TabsTrigger value="ai" className="gap-2"><Bot className="h-4 w-4"/> AI Logs</TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-muted/10">
            <TabsContent value="raw" className="m-0 h-full">
              <div className="grid grid-cols-2 gap-4 h-full">
                <div className="rounded border bg-background p-4 overflow-auto">
                  <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wider">Raw Business DB</h3>
                  <pre className="text-xs text-foreground/80">{JSON.stringify(profile.identity, null, 2)}</pre>
                </div>
                <div className="rounded border bg-background p-4 overflow-auto">
                  <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wider">Raw Pages DB</h3>
                  <pre className="text-xs text-foreground/80">{JSON.stringify(profile.pages, null, 2)}</pre>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="normalized" className="m-0 h-full">
              <div className="rounded border bg-background p-4 h-full overflow-auto flex items-center justify-center text-muted-foreground">
                [Pipeline Stage 1 & 2 Output] - Coming in Phase 2
              </div>
            </TabsContent>

            <TabsContent value="facts" className="m-0 h-full">
              <div className="rounded border bg-background p-4 h-full overflow-auto flex items-center justify-center text-muted-foreground">
                [Pipeline Stage 4 Output] - Rule Engine BusinessFactNodes - Coming in Phase 2
              </div>
            </TabsContent>

            <TabsContent value="ai" className="m-0 h-full">
              <div className="grid grid-cols-2 gap-4 h-full">
                <div className="rounded border bg-background p-4 overflow-auto">
                  <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wider">LLM Prompt JSON</h3>
                  <div className="flex items-center justify-center h-4/5 text-muted-foreground text-sm">
                    Will display the Exact CanonicalBusinessProfile passed to Gemini.
                  </div>
                </div>
                <div className="rounded border bg-background p-4 overflow-auto">
                  <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wider">LLM Raw Response</h3>
                  <pre className="text-xs text-foreground/80">{JSON.stringify(profile.analysis, null, 2)}</pre>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
