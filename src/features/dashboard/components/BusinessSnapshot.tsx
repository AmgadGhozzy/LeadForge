import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Smartphone, Globe, MessageCircle, Bot, AlertTriangle, CheckCircle2, Star, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BusinessSnapshotProps {
  business: any;
  analysis?: any;
  compact?: boolean;
}

export function BusinessSnapshot({ business, analysis, compact = false }: BusinessSnapshotProps) {
  if (!business) return null;

  const caps = business.business_capabilities || [];
  const techs = business.business_technologies || [];
  const contacts = business.contacts || [];

  const hasBooking = caps.some((c: any) => c.type === 'booking');
  const hasWhatsApp = contacts.some((c: any) => c.type === 'WHATSAPP');
  const hasChatbot = caps.some((c: any) => c.type === 'chat');

  // Website Platform
  const cms = techs.find((t: any) => t.category === 'CMS')?.name;
  const ecommerce = techs.find((t: any) => t.category === 'eCommerce')?.name;
  const framework = techs.find((t: any) => t.category === 'Framework')?.name;
  const platform = ecommerce || cms || framework || 'Custom / Unknown';

  // Extract from analysis if available
  const healthScore = analysis?.lead_score; 
  const contactability = analysis?.sales_readiness >= 75 ? 'High' : analysis?.sales_readiness >= 40 ? 'Medium' : 'Low';
  
  // Calculate automation gap based on missing basics
  let gapScore = 0;
  if (!hasBooking) gapScore += 1;
  if (!hasWhatsApp) gapScore += 1;
  if (!hasChatbot) gapScore += 1;
  const automationGap = gapScore === 3 ? 'High' : gapScore === 2 ? 'Medium' : 'Low';

  const getGapColor = (gap: string) => {
    switch (gap) {
      case 'High': return 'text-red-400';
      case 'Medium': return 'text-amber-400';
      case 'Low': return 'text-emerald-400';
      default: return 'text-muted-foreground';
    }
  };

  const StatusIcon = ({ active }: { active: boolean }) => (
    active ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-red-400" />
  );

  return (
    <Card className={cn("border-border/40 overflow-hidden shadow-sm", compact ? 'bg-transparent border-none shadow-none' : 'bg-card')}>
      <CardContent className={cn("grid gap-4", compact ? 'p-0' : 'p-5')}>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 text-sm">
          
          {/* Column 1: Core */}
          <div className="space-y-3 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border/50 pb-2">Core Info</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Rating</span>
              <span className="flex items-center gap-1 font-medium whitespace-nowrap">
                {business.rating ? <><Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" /> {business.rating}</> : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Category</span>
              <span className="font-medium truncate text-right" title={business.categories?.name}>
                {business.categories?.name || '-'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Platform</span>
              <span className="font-medium truncate text-right" title={platform}>
                {platform}
              </span>
            </div>
          </div>

          {/* Column 2: Digital Presence */}
          <div className="space-y-3 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border/50 pb-2">Digital Setup</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Booking</span>
              <StatusIcon active={hasBooking} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">WhatsApp</span>
              <StatusIcon active={hasWhatsApp} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Chatbot</span>
              <StatusIcon active={hasChatbot} />
            </div>
          </div>

          {/* Column 3: Readiness (Requires AI Analysis) */}
          <div className="space-y-3 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border/50 pb-2">Scores</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Health</span>
              <span className="font-bold whitespace-nowrap">{healthScore ? `${healthScore}/100` : '-'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Contactable</span>
              <span className="font-medium whitespace-nowrap">{analysis ? contactability : '-'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">Auto Gap</span>
              <span className={cn("font-medium whitespace-nowrap", getGapColor(automationGap))}>{automationGap}</span>
            </div>
          </div>

          {/* Column 4: Sales Signals (Requires AI Analysis) */}
          <div className="space-y-3 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3 border-b border-border/50 pb-2">Sales Signals</p>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-muted-foreground text-xs whitespace-nowrap">Best Offer</span>
              <span className="font-medium truncate text-purple-400" title={analysis?.recommended_offer}>
                {analysis?.recommended_offer || '-'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 mt-2 min-w-0">
              <span className="text-muted-foreground text-xs whitespace-nowrap">Priority</span>
              {analysis?.priority_tier ? (
                <Badge variant="outline" className={cn(
                  "w-fit text-[10px] h-5 px-1.5 whitespace-nowrap",
                  analysis.priority_tier === 'IMMEDIATE' ? 'border-red-500/30 text-red-500 bg-red-500/5' :
                  analysis.priority_tier === 'HIGH' ? 'border-amber-500/30 text-amber-500 bg-amber-500/5' :
                  'border-blue-500/30 text-blue-500 bg-blue-500/5'
                )}>
                  {analysis.priority_tier}
                </Badge>
              ) : <span className="text-muted-foreground">-</span>}
            </div>
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
