import { useParams } from 'react-router-dom';
import { useCanonicalProfile } from '@/features/dashboard/hooks/use-canonical-profile';
import { DecisionHeader } from '@/features/dashboard/components/workspace/DecisionHeader';
import { ContextBar } from '@/features/dashboard/components/workspace/ContextBar';
import { KnowledgeScorecard } from '@/features/dashboard/components/workspace/KnowledgeScorecard';
import { ScoreExplainer } from '@/features/dashboard/components/workspace/ScoreExplainer';
import { OpportunityMatrix } from '@/features/dashboard/components/workspace/OpportunityMatrix';
import { DeveloperMode } from '@/features/dashboard/components/workspace/DeveloperMode';
import { useAnalyzeBusiness } from '@/features/dashboard/hooks/use-analyze-business';
import { useGenerateSales } from '@/features/dashboard/hooks/use-generate-sales';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Globe, MapPin, Phone, Mail, MessageCircle, ExternalLink, Sparkles, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function LeadWorkspacePage() {
  const { projectId, businessId } = useParams<{ projectId: string; businessId: string }>();
  const { profile, isLoading, error } = useCanonicalProfile(businessId);
  const analyzeMutation = useAnalyzeBusiness();
  const salesMutation = useGenerateSales();

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-background/50 p-6 max-w-6xl mx-auto space-y-8 animate-pulse w-full">
        <div className="h-28 bg-card rounded-xl border p-6 space-y-3">
          <div className="h-6 w-48 bg-muted rounded" />
          <div className="h-4 w-72 bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-card rounded-xl border p-4 bg-muted/20" />
          <div className="h-32 bg-card rounded-xl border p-4 bg-muted/20" />
          <div className="h-32 bg-card rounded-xl border p-4 bg-muted/20" />
        </div>
        <div className="h-44 bg-card rounded-xl border p-6 space-y-3 bg-muted/20">
          <div className="h-5 w-36 bg-muted rounded" />
          <div className="h-4 w-full bg-muted rounded" />
          <div className="h-4 w-3/4 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-2" />
        <p className="text-destructive font-medium">Failed to load business profile.</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const { identity, reputation, digitalPresence, contacts, technologies, analysis, insights, scores } = profile;

  // The Top Insight (Highest Severity)
  const topInsight = insights.filter((i: any) => i.type !== 'STRENGTH').sort((a: any, b: any) => {
    const weights: any = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1, 'Info': 0 };
    return (weights[b.severity] || 0) - (weights[a.severity] || 0);
  })[0];

  const generatedMessages = analysis?.generated_messages || [];

  return (
    <div className="flex flex-col h-full bg-background/50 animate-fade-in">
      {/* LAYER 1: Decision Header & Context Bar */}
      <div className="bg-card border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-8 pt-6 pb-0">
          <DecisionHeader 
            projectId={projectId!}
            profile={profile}
            onAnalyze={() => analyzeMutation.mutate(businessId!)}
            onGenerateSales={() => salesMutation.mutate({ businessId: businessId!, language: 'ar' })}
            isAnalyzing={analyzeMutation.isPending}
            isGenerating={salesMutation.isPending}
          />
        </div>
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <ContextBar profile={profile} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-12">
          
          {/* LAYER 2: Business Overview */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight">Business Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Identity & Location</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {identity.address || 'Unknown'}</div>
                  {identity.place_id && <div className="flex items-center gap-2 text-blue-500 hover:underline"><ExternalLink className="h-4 w-4" /> <a href={`https://www.google.com/maps/place/?q=place_id:${identity.place_id}`} target="_blank" rel="noreferrer">View on Google Maps</a></div>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Digital Presence</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {digitalPresence.website ? (
                    <div className="flex items-center gap-2 text-blue-500 hover:underline"><Globe className="h-4 w-4" /> <a href={digitalPresence.website} target="_blank" rel="noreferrer">{digitalPresence.website}</a></div>
                  ) : (
                    <div className="text-muted-foreground">No website detected.</div>
                  )}
                  {technologies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {technologies.slice(0,4).map((t: any, i: number) => <Badge key={i} variant="secondary" className="text-[10px]">{t.name}</Badge>)}
                      {technologies.length > 4 && <Badge variant="outline" className="text-[10px]">+{technologies.length - 4} more</Badge>}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Contacts Discovered</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {contacts.length === 0 && <div className="text-muted-foreground">No contacts found.</div>}
                  {contacts.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      {c.type === 'PHONE' && <Phone className="h-4 w-4 text-muted-foreground" />}
                      {c.type === 'EMAIL' && <Mail className="h-4 w-4 text-muted-foreground" />}
                      {c.type === 'WHATSAPP' && <MessageCircle className="h-4 w-4 text-emerald-500" />}
                      {['FACEBOOK','INSTAGRAM','LINKEDIN'].includes(c.type) && <Globe className="h-4 w-4 text-blue-500" />}
                      <span className="truncate">{c.value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* LAYER 3: Knowledge Health */}
          <section className="space-y-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold tracking-tight">Knowledge Health</h2>
              <ScoreExplainer profile={profile} />
            </div>
            <Card>
              <CardContent className="p-6">
                <KnowledgeScorecard scores={scores} />
              </CardContent>
            </Card>
          </section>

          {/* LAYER 4: AI Recommendations (Top Insight) */}
          {topInsight && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">Next Best Action</h2>
              <div className="rounded-xl border bg-gradient-to-br from-card to-purple-500/5 p-6 shadow-sm border-purple-500/20">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-2 text-purple-500 font-semibold uppercase tracking-wider text-xs">
                      <Sparkles className="h-4 w-4" /> Top AI Insight
                    </div>
                    <div>
                      <h3 className="text-xl font-bold" dir="auto">{topInsight.insight || topInsight.finding}</h3>
                      <p className="text-muted-foreground mt-2 text-sm" dir="auto">{analysis.summary}</p>
                    </div>
                  </div>
                  <div className="w-full md:w-64 shrink-0 flex flex-col gap-3">
                    <div className="bg-background/80 rounded-lg p-3 border">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Suggested Offer</span>
                      <p className="font-semibold text-purple-400 mt-1 truncate" dir="auto">{analysis.recommended_offer || 'Unknown'}</p>
                    </div>
                    <div className="bg-background/80 rounded-lg p-3 border">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Sales Hook</span>
                      <p className="font-medium text-sm mt-1 line-clamp-3" dir="auto">{analysis.sales_angle}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* LAYER 5: Evidence & Timeline */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">Opportunity Matrix</h2>
              <OpportunityMatrix insights={insights} profile={profile} />
            </div>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
              <Card>
                <CardContent className="p-4 space-y-4">
                  {analysis && (
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                        <div className="w-px h-full bg-border mt-1" />
                      </div>
                      <div className="pb-2">
                        <p className="text-sm font-medium">AI Analysis Completed</p>
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground mt-1.5" />
                      <div className="w-px h-full bg-border mt-1" />
                    </div>
                    <div className="pb-2">
                      <p className="text-sm font-medium">Pipeline Normalization</p>
                      <p className="text-xs text-muted-foreground">Today</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground mt-1.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Imported from Search</p>
                      <p className="text-xs text-muted-foreground">Today</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* LAYER 6: Developer Mode */}
          <DeveloperMode profile={profile} />

        </div>
      </div>
    </div>
  );
}
