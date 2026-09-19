import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Search, Zap, PhoneCall, Mail, Clock, AlertOctagon, Globe, MessageCircle } from 'lucide-react';
import { calculatePriorityScore } from '@shared/intelligence/priority/engine';
import type { BusinessSignals } from '@shared/intelligence/types';

export function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['dashboard-businesses', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('businesses')
        .select('*, website_analyses(*), contacts(*), business_technologies(*)')
        .eq('project_id', projectId);
      return data || [];
    },
    enabled: !!projectId
  });

  const executionStats = useMemo(() => {
    let callNow = 0;
    let sendAudit = 0;
    let followUp = 0;
    let blocked = 0;
    let websiteOpportunity = 0;
    let automationOpportunity = 0;
    
    if (!businesses) return { callNow, sendAudit, followUp, blocked, websiteOpportunity, automationOpportunity };

    businesses.forEach((b: any) => {
      const analysis = b.website_analyses?.[0];
      const contacts = Array.isArray(b.contacts) ? b.contacts : [];
      const tech = Array.isArray(b.business_technologies) ? b.business_technologies : [];
      
      const signals: BusinessSignals = {
        hasPhone: contacts.some((c: any) => c.type === 'PHONE'),
        hasWebsite: !!b.website,
        hasWhatsApp: contacts.some((c: any) => c.type === 'WHATSAPP'),
        hasBooking: tech.some((t: any) => t.category === 'Booking' || t.name.toLowerCase().includes('booking') || t.name.toLowerCase().includes('reservation')),
        hasChatbot: tech.some((t: any) => t.category === 'Live Chat' || t.name.toLowerCase().includes('chat') || t.name.toLowerCase().includes('bot')),
        rating: b.rating || 0,
        reviewsCount: b.reviews || 0,
        isAnalyzed: b.status === 'ANALYZED',
        aiCriticalIssues: analysis?.analysis_items?.filter((i: any) => i.severity === 'Critical').length || 0,
        hasDecisionMaker: false
      };

      const priority = calculatePriorityScore(signals);
      // Legacy NextBestAction removed. Opportunities are currently 0-rule.
      
      // Fallback heuristics until new Opportunity rules are defined.
      if (priority.tier === 'IMMEDIATE' && signals.hasPhone) callNow++;
      else if (priority.tier === 'HIGH' && signals.hasWebsite) sendAudit++;
      else followUp++;
      
      if (!signals.hasPhone && !signals.hasWebsite && !signals.hasWhatsApp) {
        blocked++; // Rough heuristic for blocked
      }

      if (!signals.hasWebsite) websiteOpportunity++;
      if (!signals.hasWhatsApp) automationOpportunity++;
    });

    return { callNow, sendAudit, followUp, blocked, websiteOpportunity, automationOpportunity };
  }, [businesses]);

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
        <p className="text-muted-foreground mt-2">
          Your daily execution plan and revenue opportunities.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Today's Execution</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
              <PhoneCall className="h-5 w-5 text-red-500" />
              <div className="text-3xl font-bold text-red-500">{executionStats.callNow}</div>
              <p className="text-xs font-bold uppercase tracking-wider text-red-500/80">Call Now</p>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
              <Mail className="h-5 w-5 text-amber-500" />
              <div className="text-3xl font-bold text-amber-500">{executionStats.sendAudit}</div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-500/80">Send Audit</p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              <div className="text-3xl font-bold text-blue-500">{executionStats.followUp}</div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-500/80">Follow Up</p>
            </CardContent>
          </Card>
          <Card className="border-slate-500/20 bg-slate-500/5">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-2">
              <AlertOctagon className="h-5 w-5 text-slate-500" />
              <div className="text-3xl font-bold text-slate-500">{executionStats.blocked}</div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500/80">Blocked</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4 pt-6">
        <h2 className="text-lg font-semibold tracking-tight">Growth Opportunities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 shrink-0">
                <Globe className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg flex items-center justify-between">
                  Website Opportunities
                  <Badge variant="secondary">{executionStats.websiteOpportunity} Leads</Badge>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Businesses operating without an active website.</p>
                <div className="mt-3 p-2 bg-muted rounded border text-xs font-medium">
                  <span className="text-muted-foreground uppercase tracking-wider mr-2">Target Offer:</span> 
                  Website + Local SEO Package
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg flex items-center justify-between">
                  Automation Opportunities
                  <Badge variant="secondary">{executionStats.automationOpportunity} Leads</Badge>
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Businesses missing WhatsApp or basic chatbot support.</p>
                <div className="mt-3 p-2 bg-muted rounded border text-xs font-medium">
                  <span className="text-muted-foreground uppercase tracking-wider mr-2">Target Offer:</span> 
                  AI Receptionist
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
        <div className="p-6 rounded-xl border border-border/50 bg-card/50 flex flex-col items-start gap-4 transition-all hover:bg-card">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Continue Working</h3>
            <p className="text-sm text-muted-foreground mt-1">Jump right back into your active pipeline and close some deals.</p>
          </div>
          <Button asChild className="mt-2">
            <Link to={`/projects/${projectId}/pipeline`}>Open Pipeline <ArrowRight className="h-4 w-4 ml-2" /></Link>
          </Button>
        </div>

        <div className="p-6 rounded-xl border border-border/50 bg-card/50 flex flex-col items-start gap-4 transition-all hover:bg-card">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Discover Leads</h3>
            <p className="text-sm text-muted-foreground mt-1">Start a new search session to import more businesses to your workspace.</p>
          </div>
          <Button asChild variant="outline" className="mt-2">
            <Link to={`/projects/${projectId}/search/new`}>New Search <ArrowRight className="h-4 w-4 ml-2" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
