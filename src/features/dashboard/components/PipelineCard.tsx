import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Sparkles, Mail, Phone, MessageCircle, MapPin, Globe, Maximize2, ExternalLink, Star, Copy, Check, Send } from 'lucide-react';
import { toast } from 'sonner';
import { BusinessSnapshot } from './BusinessSnapshot';
import { extractDbpgEvidence } from '../utils/dbpg-Shared';
import { cn } from '@/lib/utils';

interface PipelineCardProps {
  business: any;
  onAnalyze: (id: string) => void;
  onGenerateSales: (id: string) => void;
  onViewSales: (business: any) => void;
  onViewAnalysis: (business: any) => void;
  isAnalyzing: boolean;
  isGenerating: boolean;
}

export function PipelineCard({
  business,
  onAnalyze,
  onGenerateSales,
  onViewSales,
  onViewAnalysis,
  isAnalyzing,
  isGenerating,
}: PipelineCardProps) {
  const [copiedWa, setCopiedWa] = useState(false);
  const analysis = business.website_analyses?.[0];
  const hasMessages = business.generated_messages?.length > 0;
  const dbpg = extractDbpgEvidence(business);
  const waMessage = business.generated_messages?.[0]?.whatsapp;
  
  // Contacts
  const phoneContact = business.contacts?.find((c: any) => c.type === 'PHONE');
  const whatsappContact = business.contacts?.find((c: any) => c.type === 'WHATSAPP');
  const primaryPhone = whatsappContact?.value || phoneContact?.value;
  const cleanPhone = primaryPhone ? primaryPhone.replace(/[^0-9+]/g, '') : null;
  const waPhone = cleanPhone ? (cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone) : null;

  const handleCopyWa = async () => {
    if (!waMessage) return;
    await navigator.clipboard.writeText(waMessage);
    setCopiedWa(true);
    toast.success('WhatsApp outreach copied to clipboard');
    setTimeout(() => setCopiedWa(false), 2000);
  };

  const mapsUrl = business.place_id 
    ? `https://www.google.com/maps/place/?q=place_id:${business.place_id}` 
    : (business.latitude && business.longitude ? `https://www.google.com/maps?q=${business.latitude},${business.longitude}` : null);

  const getPriorityColor = (tier: string) => {
    switch (tier) {
      case 'IMMEDIATE': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'HIGH': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'MEDIUM': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden hover:shadow-md transition-shadow group">
      <CardHeader className="p-4 pb-0 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <button
            onClick={() => onViewAnalysis(business)}
            className="font-semibold text-lg text-left hover:text-primary transition-colors line-clamp-1"
            title={business.name}
            dir="auto"
          >
            {business.name}
          </button>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <Badge variant={dbpg.badgeVariant} className={cn("text-[9px] px-1.5 py-0", dbpg.badgeStyle)} title={dbpg.auditTrail}>
              {dbpg.statusLabel}
            </Badge>
            {analysis?.priority_tier && (
              <Badge variant="outline" className={`text-[10px] ${getPriorityColor(analysis.priority_tier)}`}>
                {analysis.priority_tier}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground" dir="auto">{business.categories?.name || 'Uncategorized'}</span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
            {business.rating || 'N/A'} ({business.reviews || 0})
          </span>
          {business.city && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {business.city}
              </span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4 flex-1">
        {/* Metric Scores */}
        <div className="grid grid-cols-4 gap-2 bg-muted/40 p-2 rounded-md">
          <div className="text-center border-r border-border/50">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Priority</div>
            <div className="font-bold text-base">{analysis?.priority_score || '-'}</div>
          </div>
          <div className="text-center border-r border-border/50">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Lead</div>
            <div className="font-bold text-base">{analysis?.lead_score || '-'}</div>
          </div>
          <div className="text-center border-r border-border/50">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Health</div>
            <div className="font-bold text-base">{business.health_score || '-'}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Readiness</div>
            <div className="font-bold text-base">{analysis?.sales_readiness || '-'}</div>
          </div>
        </div>

        {/* Replaced old text snapshot with BusinessSnapshot */}
        <div className="border border-border/40 rounded-md p-3 bg-muted/10">
          <BusinessSnapshot business={business} analysis={analysis} compact />
        </div>
      </CardContent>

      <CardFooter className="p-3 bg-muted/20 border-t flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-1">
          {business.status !== 'ANALYZED' ? (
            <Button
              variant="default" size="sm"
              className="text-xs h-8 flex-1"
              onClick={() => onAnalyze(business.id)}
              disabled={!business.website || isAnalyzing}
            >
              <Sparkles className={`h-3 w-3 mr-1 ${isAnalyzing ? 'animate-spin' : ''}`} />
              Analyze
            </Button>
          ) : (
            <Button
              variant="default" size="sm"
              className="text-xs h-8 flex-1 bg-purple-600 hover:bg-purple-700"
              onClick={() => onGenerateSales(business.id)}
              disabled={isGenerating}
            >
              <Sparkles className={`h-3 w-3 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
              Sales
            </Button>
          )}

          <Button
            variant="secondary" size="sm"
            className="text-xs h-8 flex-1"
            onClick={() => onViewAnalysis(business)}
          >
            <Maximize2 className="h-3 w-3 mr-1" />
            Expand
          </Button>
        </div>

        {waMessage && (
          <div className="flex gap-1.5 w-full bg-emerald-500/5 border border-emerald-500/20 p-1.5 rounded-lg mt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs flex-1 gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              onClick={handleCopyWa}
              title="1-Click Copy WhatsApp Outreach"
            >
              {copiedWa ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copiedWa ? 'Copied' : 'Copy WA'}
            </Button>
            {waPhone && (
              <Button
                variant="default"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`, '_blank')}
                title={`1-Click Send to ${waPhone}`}
              >
                <Send className="h-3 w-3" /> Send
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-1 w-full justify-between mt-1">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs flex-1" asChild disabled={!business.website}>
            <a href={business.website} target="_blank" rel="noopener noreferrer">
              <Globe className="h-3 w-3 mr-1" /> Web
            </a>
          </Button>
          
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs flex-1" asChild disabled={!mapsUrl}>
            <a href={mapsUrl || '#'} target="_blank" rel="noopener noreferrer">
              <MapPin className="h-3 w-3 mr-1" /> Maps
            </a>
          </Button>

          <Button variant="outline" size="sm" className="h-7 px-2 text-xs flex-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 disabled:opacity-50" asChild disabled={!whatsappContact}>
            <a href={whatsappContact?.value ? (whatsappContact.value.startsWith('http') ? whatsappContact.value : `https://wa.me/${whatsappContact.value.replace(/[^0-9]/g, '')}`) : '#'} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-3 w-3 mr-1" /> WA
            </a>
          </Button>

          <Button variant="outline" size="sm" className="h-7 px-2 text-xs flex-1 text-blue-600 border-blue-200 hover:bg-blue-50 disabled:opacity-50" asChild disabled={!phoneContact}>
            <a href={phoneContact?.value ? `tel:${phoneContact.value}` : '#'}>
              <Phone className="h-3 w-3 mr-1" /> Call
            </a>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
