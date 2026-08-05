import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExternalLink, Mail, Phone, RefreshCw, Smartphone, Calendar, MessageCircle, Globe, Sparkles, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEnrichBusiness } from '../hooks/use-enrich-business';
import { useAnalyzeBusiness } from '../hooks/use-analyze-business';
import { useGenerateSales } from '../hooks/use-generate-sales';
import { useBulkAnalyze } from '../hooks/use-bulk-analyze';
import { BulkActionBar } from './BulkActionBar';
import { SalesAssetsModal } from './SalesAssetsModal';
import { AnalysisDetailsModal } from './AnalysisDetailsModal';
import { ExportButton } from './ExportButton';
import { BusinessSnapshot } from './BusinessSnapshot';
import { cn } from '@/lib/utils';

interface BusinessTableProps {
  businesses: any[]; // Using any[] temporarily for the joined data structure until we tighten the types
  isLoading: boolean;
}

export function BusinessTable({ businesses, isLoading }: BusinessTableProps) {
  const enrichMutation = useEnrichBusiness();
  const analyzeMutation = useAnalyzeBusiness();
  const salesMutation = useGenerateSales();
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [analysisModalBusiness, setAnalysisModalBusiness] = useState<any | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const bulkAnalyze = useBulkAnalyze();

  if (isLoading) {
    return <div className="text-center py-10 text-muted-foreground">Loading businesses...</div>;
  }

  if (businesses.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12 text-muted-foreground">
          No businesses found. Go to the Search tab to import some.
        </CardContent>
      </Card>
    );
  }

  const sorted = [...businesses].sort((a, b) => {
    const scoreA = a.website_analyses?.[0]?.priority_score ?? -1;
    const scoreB = b.website_analyses?.[0]?.priority_score ?? -1;
    return scoreB - scoreA;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'READY_FOR_ANALYSIS': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'NEW': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'ANALYZED': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'FAILED': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getTierBadge = (tier: string | null) => {
    switch (tier) {
      case 'IMMEDIATE': return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">🔥 Immediate</Badge>;
      case 'HIGH': return <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">⭐ High</Badge>;
      case 'MEDIUM': return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[10px]">🟡 Medium</Badge>;
      case 'LOW': return <Badge variant="outline" className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 text-[10px]">⚪ Low</Badge>;
      default: return <span className="text-muted-foreground text-xs">-</span>;
    }
  };

  const getActionBadge = (action: string | null) => {
    switch (action) {
      case 'CALL': return <Badge variant="secondary" className="text-[10px] gap-1"><Phone className="h-2.5 w-2.5" />Call</Badge>;
      case 'EMAIL': return <Badge variant="secondary" className="text-[10px] gap-1"><Mail className="h-2.5 w-2.5" />Email</Badge>;
      case 'WHATSAPP': return <Badge variant="secondary" className="text-[10px] gap-1"><MessageCircle className="h-2.5 w-2.5" />WhatsApp</Badge>;
      case 'IGNORE': return <Badge variant="secondary" className="text-[10px] text-muted-foreground">Skip</Badge>;
      default: return <span className="text-muted-foreground text-xs">-</span>;
    }
  };

  const getCapabilityIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'whatsapp': return <Smartphone className="h-3 w-3 text-emerald-500" />;
      case 'booking': return <Calendar className="h-3 w-3 text-blue-500" />;
      case 'chat': return <MessageCircle className="h-3 w-3 text-purple-500" />;
      case 'facebook':
      case 'instagram':
      case 'linkedin': return <Globe className="h-3 w-3 text-muted-foreground" />;
      default: return null;
    }
  };

  const getReadinessColor = (score: number) => {
    if (score >= 70) return 'bg-emerald-500';
    if (score >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedRows(newSet);
  };

  const exportData = sorted.map(b => {
    const analysis = b.website_analyses?.[0];
    return {
      name: b.name,
      category: b.categories?.name,
      address: b.address,
      website: b.website,
      lead_score: analysis?.lead_score,
      sales_readiness: analysis?.sales_readiness,
      priority_score: analysis?.priority_score,
      priority_tier: analysis?.priority_tier,
      next_action: analysis?.next_action,
      next_action_reason: analysis?.next_action_reason,
      urgency: analysis?.urgency,
      contacts: b.contacts,
    };
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Imported Businesses</CardTitle>
          <ExportButton businesses={exportData} />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-12 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-border"
                      checked={selectedRows.size > 0 && selectedRows.size === sorted.length}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedRows(new Set(sorted.map(b => b.id)));
                        else setSelectedRows(new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead>Business Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Lead Score</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead>Next Action</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((business) => {
                  const analysis = business.website_analyses?.[0];
                  const hasMessages = business.generated_messages?.length > 0;
                  const isExpanded = expandedRows.has(business.id);

                  return (
                    <React.Fragment key={business.id}>
                      <TableRow className={cn(selectedRows.has(business.id) && 'bg-muted/50')}>
                        <TableCell className="p-2 text-center">
                          <button onClick={() => toggleExpand(business.id)} className="text-muted-foreground hover:text-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </TableCell>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={selectedRows.has(business.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedRows);
                              if (e.target.checked) newSet.add(business.id);
                              else newSet.delete(business.id);
                              setSelectedRows(newSet);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              className="font-medium text-left hover:text-purple-400 hover:underline underline-offset-2 transition-colors cursor-pointer"
                              onClick={() => {
                                setAnalysisModalBusiness(business);
                                setAnalysisModalOpen(true);
                              }}
                            >
                              {business.name}
                            </button>
                            {business.website && (
                              <a href={business.website} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{business.categories?.name || 'Uncategorized'}</TableCell>
                        <TableCell>{getTierBadge(analysis?.priority_tier)}</TableCell>
                        <TableCell>
                          {analysis?.lead_score != null ? (
                            <Badge variant="default" className="bg-purple-500 hover:bg-purple-600 text-xs">
                              {analysis.lead_score}
                            </Badge>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </TableCell>
                        <TableCell>
                          {analysis?.sales_readiness != null ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium">{analysis.sales_readiness}</span>
                                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${getReadinessColor(analysis.sales_readiness)} rounded-full transition-all`}
                                        style={{ width: `${analysis.sales_readiness}%` }}
                                      />
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">
                                  Sales Readiness: Can we reach them?
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </TableCell>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>{getActionBadge(analysis?.next_action)}</TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs">
                                {analysis?.next_action_reason || 'Not analyzed yet'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {business.business_capabilities?.map((cap: any) => (
                              <Badge key={cap.id} variant="secondary" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                                {getCapabilityIcon(cap.type)}
                                <span className="capitalize">{cap.type}</span>
                              </Badge>
                            ))}
                            {!business.business_capabilities?.length && (
                              <span className="text-muted-foreground text-xs italic">Unknown</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(business.status)}>
                            {business.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              variant="outline" size="sm" 
                              onClick={() => enrichMutation.mutate(business.id)}
                              disabled={!business.website || (enrichMutation.isPending && enrichMutation.variables === business.id) || business.status === 'ANALYZING'}
                              className="h-8 w-8 p-0" title="Scrape & Detect Capabilities"
                            >
                              <RefreshCw className={`h-4 w-4 ${enrichMutation.isPending && enrichMutation.variables === business.id ? 'animate-spin' : ''}`} />
                            </Button>
                            
                            <Button 
                              variant="default" size="sm" 
                              onClick={() => analyzeMutation.mutate(business.id)}
                              disabled={!business.website || (analyzeMutation.isPending && analyzeMutation.variables === business.id) || business.status === 'NEW' || business.status === 'ANALYZING'}
                              className="h-8 w-8 p-0 bg-purple-600 hover:bg-purple-700 text-white" title="Analyze with Gemini AI"
                            >
                              <Sparkles className={`h-4 w-4 ${analyzeMutation.isPending && analyzeMutation.variables === business.id ? 'animate-spin' : ''}`} />
                            </Button>

                            {business.status === 'ANALYZED' && (
                              <Button
                                variant="outline" size="sm"
                                onClick={() => salesMutation.mutate({ businessId: business.id, language: 'en' })}
                                disabled={salesMutation.isPending && salesMutation.variables?.businessId === business.id}
                                className="h-8 px-2 text-xs gap-1 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                              >
                                <Sparkles className={`h-3.5 w-3.5 ${salesMutation.isPending && salesMutation.variables?.businessId === business.id ? 'animate-spin' : ''}`} />
                                Sales
                              </Button>
                            )}

                            {hasMessages && (
                              <Button
                                variant="ghost" size="sm" className="h-8 w-8 p-0"
                                onClick={() => { setSelectedBusiness(business); setModalOpen(true); }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {isExpanded && (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={11} className="p-4 border-b border-border">
                            <BusinessSnapshot business={business} analysis={analysis} />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <SalesAssetsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        businessName={selectedBusiness?.name || ''}
        priorityTier={selectedBusiness?.website_analyses?.[0]?.priority_tier}
        nextAction={selectedBusiness?.website_analyses?.[0]?.next_action}
        salesAssets={selectedBusiness?.generated_messages?.[0] || null}
      />

      <AnalysisDetailsModal
        open={analysisModalOpen}
        onClose={() => setAnalysisModalOpen(false)}
        business={analysisModalBusiness}
      />

      <BulkActionBar
        selectedCount={selectedRows.size}
        isAnalyzing={bulkAnalyze.isAnalyzing}
        completed={bulkAnalyze.completed}
        total={bulkAnalyze.total}
        onClear={() => setSelectedRows(new Set())}
        onAnalyze={() => bulkAnalyze.analyzeBulk(Array.from(selectedRows))}
      />
    </>
  );
}
