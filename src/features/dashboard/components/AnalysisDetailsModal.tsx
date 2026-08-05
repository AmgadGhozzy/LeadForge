import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2, XCircle, Lightbulb, Bot, Target, ExternalLink, Activity, Sparkles, ChevronDown, ChevronUp, AlertCircle, Wrench
} from 'lucide-react';
import { useState } from 'react';
import { BusinessSnapshot } from './BusinessSnapshot';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface AnalysisDetailsModalProps {
  open: boolean;
  onClose: () => void;
  business: any;
}

function EvidenceCard({ item, type }: { item: any; type: 'strength' | 'weakness' | 'automation' | 'ai' }) {
  const [expanded, setExpanded] = useState(false);
  
  // Legacy backward compatibility fallback
  if (!item.insight && !item.finding && item.content) {
    return (
      <div className="flex items-start gap-2 rounded-lg border bg-muted/20 border-border/50 p-3">
        <p className="text-sm">{item.content}</p>
      </div>
    );
  }

  const getStyle = () => {
    switch (type) {
      case 'strength': return 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400';
      case 'weakness': return 'border-red-500/20 bg-red-500/5 text-red-400';
      case 'ai': return 'border-purple-500/20 bg-purple-500/5 text-purple-400';
      case 'automation': return 'border-amber-500/20 bg-amber-500/5 text-amber-400';
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'Critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'High': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'Medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'Low': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'strength': return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
      case 'weakness': return <XCircle className="h-4 w-4 shrink-0 text-red-400" />;
      case 'ai': return <Bot className="h-4 w-4 shrink-0 text-purple-400" />;
      case 'automation': return <Lightbulb className="h-4 w-4 shrink-0 text-amber-400" />;
    }
  };

  const evidence = typeof item.evidence === 'string' ? JSON.parse(item.evidence) : item.evidence;
  const positive = evidence?.positive || [];
  const negative = evidence?.negative || [];

  const impact = typeof item.business_impact === 'string' ? null : item.business_impact;
  const legacyImpact = typeof item.business_impact === 'string' ? item.business_impact : null;
  const metrics = item.opportunity_metrics;
  
  // Handle Phase 1.5 single offer or Phase 1.6 offers array
  const offers = Array.isArray(item.suggested_offers) 
    ? item.suggested_offers 
    : (item.suggested_offer && typeof item.suggested_offer !== 'string' ? [item.suggested_offer] : []);
  const topOffer = offers[0];
  const otherOffers = offers.slice(1);
  const legacyOffer = typeof item.suggested_offer === 'string' ? item.suggested_offer : null;

  // The primary text to show (Phase 1.6 uses 'insight', earlier uses 'finding')
  const primaryText = item.insight || item.finding;

  return (
    <div className={cn("rounded-lg border p-3 flex flex-col gap-2 transition-colors", getStyle())}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5">{getIcon()}</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{primaryText}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {item.severity && (
              <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", getSeverityStyle(item.severity))}>
                {item.severity}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", getStyle())}>
              {item.confidence}% Confidence
            </Badge>
            <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", getStyle())}>
              Level: {item.evidence_level}
            </Badge>
            {item.discovered_at && (
              <span className="text-[9px] text-muted-foreground ml-auto">
                {format(new Date(item.discovered_at), 'MMM d, h:mm a')}
              </span>
            )}
          </div>
        </div>
        <button 
          onClick={() => setExpanded(!expanded)} 
          className="text-muted-foreground hover:text-foreground p-1 shrink-0"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 pt-3 border-t border-border/10 space-y-3">
          
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/80">Reason: </span>
            {item.confidence_reason}
          </div>

          <div className="grid grid-cols-1 gap-2">
            {positive.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-500/70">Signals Found</span>
                <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
                  {positive.map((s: any, i: number) => (
                    <li key={i}>
                      {s.type} {s.value ? `(${s.value})` : ''} via {s.source}
                      {s.page_url && <a href={s.page_url} target="_blank" className="ml-1 text-blue-400 hover:underline">[{s.page_url}]</a>}
                      {s.confidence_source && <span className="ml-1 opacity-60">({s.confidence_source})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {negative.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-red-500/70">Checked But Not Found</span>
                <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
                  {negative.map((s: any, i: number) => (
                    <li key={i}>
                      {s.type} via {s.source}
                      {s.page_url && <span className="ml-1 opacity-60">[{s.page_url}]</span>}
                      {s.confidence_source && <span className="ml-1 opacity-60">({s.confidence_source})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Business Impact Structure */}
          {impact && (
            <div className="bg-background/50 rounded p-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-foreground/80 flex items-center gap-1">
                  <Activity className="h-3 w-3 text-amber-500" /> Impact: {impact.impact_type}
                </span>
                <span className="font-bold text-amber-500">Score: {impact.impact_score}/100</span>
              </div>
              <p className="text-muted-foreground ml-4">{impact.description}</p>
            </div>
          )}
          
          {legacyImpact && (
            <div className="bg-background/50 rounded p-2 text-xs">
              <span className="font-semibold text-foreground/80 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-amber-500" /> Business Impact
              </span>
              <p className="text-muted-foreground mt-0.5 ml-4">{legacyImpact}</p>
            </div>
          )}

          {/* Technical Fix */}
          {item.technical_fix && (
            <div className="bg-blue-500/5 border border-blue-500/10 rounded p-2 text-xs">
              <span className="font-semibold text-blue-400 flex items-center gap-1 mb-1">
                <Wrench className="h-3 w-3" /> Technical Fix Recommendation
              </span>
              <p className="text-muted-foreground ml-4">{item.technical_fix}</p>
            </div>
          )}

          {/* Metrics & Offers */}
          {(metrics || topOffer || legacyOffer) && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {metrics && (
                <div className="bg-background/50 rounded p-2 text-xs flex flex-col gap-1">
                  <span className="font-semibold text-foreground/80">Opportunity Metrics</span>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Effort</span>
                    <Badge variant="outline" className="h-4 text-[9px] px-1">{metrics.estimated_effort}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ROI</span>
                    <Badge variant="outline" className="h-4 text-[9px] px-1">{metrics.estimated_roi}</Badge>
                  </div>
                </div>
              )}
              
              {topOffer && (
                <div className="bg-purple-500/5 border border-purple-500/10 rounded p-2 text-xs flex flex-col gap-1">
                  <span className="font-semibold text-purple-400 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Top Suggested Offer
                  </span>
                  <p className="text-foreground/90 font-medium">{topOffer.offer_name}</p>
                  <p className="text-muted-foreground text-[10px]">Match Confidence: {topOffer.confidence}%</p>
                  {otherOffers.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-purple-500/10">
                      <span className="text-[9px] text-muted-foreground">Alternatives: {otherOffers.map((o: any) => o.offer_name).join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {legacyOffer && (
                <div className="bg-purple-500/5 border border-purple-500/10 rounded p-2 text-xs flex flex-col gap-1 col-span-2">
                  <span className="font-semibold text-purple-400 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Suggested Solution
                  </span>
                  <p className="text-muted-foreground">{legacyOffer}</p>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {item.tags.map((tag: string, i: number) => (
                <span key={i} className="text-[9px] bg-background text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

export function AnalysisDetailsModal({ open, onClose, business }: AnalysisDetailsModalProps) {
  if (!business) return null;

  const analysis = business.website_analyses?.[0];
  const items = analysis?.analysis_items || [];

  const strengths = items.filter((i: any) => i.type === 'STRENGTH');
  const weaknesses = items.filter((i: any) => i.type === 'WEAKNESS');
  const aiOpportunities = items.filter((i: any) => i.type === 'AI_OPPORTUNITY');
  const automationOpportunities = items.filter((i: any) => i.type === 'AUTOMATION_OPPORTUNITY');

  const hasAnalysis = !!analysis;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-xl">{business.name}</DialogTitle>
            {business.website && (
              <a
                href={business.website}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </DialogHeader>

        <BusinessSnapshot business={business} analysis={analysis} />

        {!hasAnalysis ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-2xl bg-purple-500/5 p-5 mb-4">
              <Sparkles className="h-10 w-10 text-purple-400/60" />
            </div>
            <h3 className="text-lg font-semibold">Not analyzed yet</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Click the "Analyze" button in the table to run an AI-powered analysis on this business.
            </p>
          </div>
        ) : (
          <div className="space-y-5 mt-2">
            
            <Tabs defaultValue="weaknesses" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="weaknesses" className="gap-1.5 text-xs">
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                  Weaknesses ({weaknesses.length})
                </TabsTrigger>
                <TabsTrigger value="strengths" className="gap-1.5 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  Strengths ({strengths.length})
                </TabsTrigger>
                <TabsTrigger value="ai" className="gap-1.5 text-xs">
                  <Bot className="h-3.5 w-3.5 text-purple-400" />
                  AI ({aiOpportunities.length})
                </TabsTrigger>
                <TabsTrigger value="automation" className="gap-1.5 text-xs">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                  Automation ({automationOpportunities.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="strengths" className="mt-3 space-y-2">
                {strengths.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No strengths identified.</p>
                ) : (
                  strengths.map((item: any, idx: number) => <EvidenceCard key={idx} item={item} type="strength" />)
                )}
              </TabsContent>

              <TabsContent value="weaknesses" className="mt-3 space-y-2">
                {weaknesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No weaknesses identified.</p>
                ) : (
                  weaknesses.map((item: any, idx: number) => <EvidenceCard key={idx} item={item} type="weakness" />)
                )}
              </TabsContent>

              <TabsContent value="ai" className="mt-3 space-y-2">
                {aiOpportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No AI opportunities identified.</p>
                ) : (
                  aiOpportunities.map((item: any, idx: number) => <EvidenceCard key={idx} item={item} type="ai" />)
                )}
              </TabsContent>

              <TabsContent value="automation" className="mt-3 space-y-2">
                {automationOpportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No automation opportunities identified.</p>
                ) : (
                  automationOpportunities.map((item: any, idx: number) => <EvidenceCard key={idx} item={item} type="automation" />)
                )}
              </TabsContent>
            </Tabs>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analysis.recommended_offer && (
                <Card className="border-purple-500/20 bg-purple-500/5">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span className="text-xs font-semibold text-purple-400">Recommended Offer</span>
                    </div>
                    <p className="text-sm font-medium">{analysis.recommended_offer}</p>
                  </CardContent>
                </Card>
              )}
              {analysis.sales_angle && (
                <Card className="border-amber-500/20 bg-amber-500/5">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-amber-400" />
                      <span className="text-xs font-semibold text-amber-400">Sales Angle</span>
                    </div>
                    <p className="text-sm">{analysis.sales_angle}</p>
                  </CardContent>
                </Card>
              )}
            </div>
            
            {analysis.summary && (
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Business Summary</p>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </CardContent>
              </Card>
            )}

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
