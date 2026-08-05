import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { AlertCircle, ArrowRight } from 'lucide-react';

export function OpportunityMatrix({ insights }: { insights: any[] }) {
  if (!insights || insights.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-lg bg-muted/10 flex flex-col items-center">
        <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
        <p>No actionable insights generated yet.</p>
        <p className="text-xs opacity-70">Run an AI analysis to populate this matrix.</p>
      </div>
    );
  }

  // Filter out strengths and sort by severity
  const actionable = insights.filter(i => i.type !== 'STRENGTH').sort((a, b) => {
    const weights: any = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1, 'Info': 0 };
    return (weights[b.severity] || 0) - (weights[a.severity] || 0);
  });

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'Critical': return <Badge variant="outline" className="text-red-500 bg-red-500/10 border-red-500/20 px-1.5 h-5 text-[10px]">CRITICAL</Badge>;
      case 'High': return <Badge variant="outline" className="text-orange-500 bg-orange-500/10 border-orange-500/20 px-1.5 h-5 text-[10px]">HIGH</Badge>;
      case 'Medium': return <Badge variant="outline" className="text-amber-500 bg-amber-500/10 border-amber-500/20 px-1.5 h-5 text-[10px]">MEDIUM</Badge>;
      case 'Low': return <Badge variant="outline" className="text-blue-500 bg-blue-500/10 border-blue-500/20 px-1.5 h-5 text-[10px]">LOW</Badge>;
      default: return <Badge variant="outline" className="text-muted-foreground px-1.5 h-5 text-[10px]">INFO</Badge>;
    }
  };

  const getImpactBadge = (impactType: string) => {
    if (!impactType) return null;
    return (
      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
        {impactType}
      </span>
    );
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead className="w-[300px]">Issue / Insight</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Business Impact</TableHead>
            <TableHead>Suggested Offer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {actionable.map((item, i) => {
            const offer = Array.isArray(item.suggested_offers) ? item.suggested_offers[0]?.offer_name : item.suggested_offer;
            const impact = item.business_impact?.impact_type || (typeof item.business_impact === 'string' ? item.business_impact : null);
            
            return (
              <TableRow key={i} className={cn("group transition-colors", item.severity === 'Critical' ? 'bg-red-500/[0.02]' : '')}>
                <TableCell className="font-medium text-sm">
                  {item.insight || item.finding}
                  {item.technical_fix && (
                    <p className="text-xs text-muted-foreground font-mono mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      ↳ Fix: {item.technical_fix}
                    </p>
                  )}
                </TableCell>
                <TableCell>{getSeverityBadge(item.severity)}</TableCell>
                <TableCell>{getImpactBadge(impact)}</TableCell>
                <TableCell>
                  {offer ? (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-400">
                      <ArrowRight className="h-3 w-3" />
                      {offer}
                    </div>
                  ) : <span className="text-muted-foreground">-</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
