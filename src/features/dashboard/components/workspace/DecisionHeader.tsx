import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Phone, MessageCircle, MapPin, Globe, ArrowLeft, Star, ExternalLink, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { extractDbpgEvidence, hasArabicCharacters } from '../../utils/dbpg-Shared';

interface DecisionHeaderProps {
  projectId: string;
  profile: any;
  onAnalyze: () => void;
  onGenerateSales: () => void;
  isAnalyzing: boolean;
  isGenerating: boolean;
}

export function DecisionHeader({ projectId, profile, onAnalyze, onGenerateSales, isAnalyzing, isGenerating }: DecisionHeaderProps) {
  const { identity, reputation, scores, analysis, contacts } = profile;
  const dbpg = extractDbpgEvidence({
    ...profile,
    website: profile.digitalPresence?.website,
    website_analyses: profile.analysis ? [profile.analysis] : [],
    business_capabilities: profile.capabilities,
    business_technologies: profile.technologies,
    contacts: profile.contacts,
  });

  const phone = contacts?.find((c: any) => c.type === 'PHONE');
  const whatsapp = contacts?.find((c: any) => c.type === 'WHATSAPP');

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'IMMEDIATE': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'HIGH': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'MEDIUM': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const isArabic = hasArabicCharacters(identity.name);

  const topOffer = analysis?.recommended_offer;

  const mapsUrl = identity.place_id 
    ? `https://www.google.com/maps/place/?q=place_id:${identity.place_id}` 
    : (identity.latitude && identity.longitude ? `https://www.google.com/maps?q=${identity.latitude},${identity.longitude}` : null);

  return (
    <div className="flex flex-col gap-4 border-b pb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="shrink-0 mt-1">
            <Link to={`/projects/${projectId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className={cn("text-3xl font-bold tracking-tight", !isArabic && "uppercase")} dir="auto">
                {identity.name}
              </h1>
              {scores.priority !== 'UNRATED' && (
                <Badge variant="outline" className={cn("uppercase text-[10px] tracking-wider font-bold", getPriorityStyle(scores.priority))}>
                  {scores.priority}
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground tracking-wide font-medium flex-wrap">
              <span dir="auto">{identity.category || 'Uncategorized'}</span>
              <span>•</span>
              <span className="truncate max-w-[200px]" title={identity.address} dir="auto">{identity.address || 'Unknown Location'}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                {reputation.rating || 'N/A'} ({reputation.reviews || 0})
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* DBPG v2.1 Evidence Badges */}
            <div className="flex flex-col items-end mr-1 text-right">
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Badge variant={dbpg.badgeVariant} className={cn("text-xs px-2.5 py-0.5", dbpg.badgeStyle)} title={dbpg.auditTrail}>
                  {dbpg.statusLabel}
                </Badge>
                {dbpg.verificationLabel && (
                  <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/5">
                    {dbpg.verificationLabel}
                  </Badge>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {dbpg.engineVersion} • {dbpg.ruleSlug}
              </span>
            </div>

            {analysis && (
              <div className="text-right border-l pl-3 border-border/60">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Lead Score</p>
                <p className="text-3xl font-black text-primary leading-none">{scores.leadScore}</p>
              </div>
            )}
            
            <Button
              variant="default"
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2 uppercase tracking-wide text-xs font-bold"
              onClick={onAnalyze}
              disabled={isAnalyzing}
            >
              <Sparkles className={cn("h-4 w-4", isAnalyzing && "animate-spin")} />
              {isAnalyzing ? 'Analyzing...' : 'Analyze'}
            </Button>

            {analysis && (
              <Button
                variant="outline"
                className="gap-2 uppercase tracking-wide text-xs font-bold border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                onClick={onGenerateSales}
                disabled={isGenerating}
              >
                <Sparkles className={cn("h-4 w-4", isGenerating && "animate-spin")} />
                {isGenerating ? 'Generating...' : 'Sales Assets'}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between ml-14">
        <div className="flex items-center gap-2">
          {phone && (
            <Button variant="outline" size="sm" asChild className="h-8 gap-2">
              <a href={`tel:${phone.value}`}><Phone className="h-3.5 w-3.5" /> Call</a>
            </Button>
          )}
          {whatsapp && (
            <Button variant="outline" size="sm" asChild className="h-8 gap-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-600 border-emerald-500/20">
              <a href={`https://wa.me/${whatsapp.value.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
            </Button>
          )}
          {mapsUrl && (
            <Button variant="outline" size="sm" asChild className="h-8 gap-2">
              <a href={mapsUrl} target="_blank" rel="noreferrer"><MapPin className="h-3.5 w-3.5" /> Maps</a>
            </Button>
          )}
          {profile.digitalPresence.website && (
            <Button variant="outline" size="sm" asChild className="h-8 gap-2">
              <a href={profile.digitalPresence.website} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5" /> Website</a>
            </Button>
          )}
        </div>

        {topOffer && (
          <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-md">
            <span className="text-[10px] uppercase font-bold text-purple-400/80 tracking-wider">Recommended Offer:</span>
            <span className="text-sm font-semibold text-purple-400 truncate max-w-[200px]">{topOffer}</span>
          </div>
        )}
      </div>
    </div>
  );
}
