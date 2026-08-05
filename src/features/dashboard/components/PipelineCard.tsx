import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Sparkles, Mail, Phone, MessageCircle, MapPin, Globe, Maximize2, ExternalLink, Star } from 'lucide-react';
import { BusinessSnapshot } from './BusinessSnapshot';

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
  const analysis = business.website_analyses?.[0];
  const hasMessages = business.generated_messages?.length > 0;
  
  // Contacts
  const phoneContact = business.contacts?.find((c: any) => c.type === 'PHONE');
  const whatsappContact = business.contacts?.find((c: any) => c.type === 'WHATSAPP');

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
      <CardHeader className="p-4 pb-0 space-y-1">
        <div className="flex justify-between items-start gap-2">
          <button
            onClick={() => onViewAnalysis(business)}
            className="font-semibold text-lg text-left hover:text-primary transition-colors line-clamp-1"
            title={business.name}
          >
            {business.name}
          </button>
          {analysis?.priority_tier && (
            <Badge variant="outline" className={`shrink-0 ${getPriorityColor(analysis.priority_tier)}`}>
              {analysis.priority_tier}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">{business.categories?.name || 'Uncategorized'}</span>
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
