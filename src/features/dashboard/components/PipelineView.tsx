import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PipelineCard } from './PipelineCard';
import { SalesAssetsModal } from './SalesAssetsModal';
import { ExportButton } from './ExportButton';
import { useAnalyzeBusiness } from '../hooks/use-analyze-business';
import { useGenerateSales } from '../hooks/use-generate-sales';
import { useNavigate } from 'react-router-dom';

interface PipelineViewProps {
  businesses: any[];
  isLoading: boolean;
}

export function PipelineView({ businesses, isLoading }: PipelineViewProps) {
  const analyzeMutation = useAnalyzeBusiness();
  const salesMutation = useGenerateSales();
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  // Group businesses by tabs
  const tabGroups = useMemo(() => {
    const groups: Record<string, any[]> = {
      OVERVIEW: [...businesses],
      NOT_ANALYZED: [],
      READY_FOR_ANALYSIS: [],
      ANALYZED: [],
      SALES_READY: [],
      IMMEDIATE: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
      ARCHIVED: [],
    };

    for (const business of businesses) {
      if (business.status === 'NEW' || business.status === 'NOT_ANALYZED') {
        groups['NOT_ANALYZED'].push(business);
      }
      if (business.status === 'READY_FOR_ANALYSIS') {
        groups['READY_FOR_ANALYSIS'].push(business);
      }
      if (business.status === 'ANALYZED') {
        groups['ANALYZED'].push(business);
      }
      if (business.generated_messages && business.generated_messages.length > 0) {
        groups['SALES_READY'].push(business);
      }
      if (business.status === 'ARCHIVED') {
        groups['ARCHIVED'].push(business);
      }

      const analysis = business.website_analyses?.[0];
      if (analysis?.priority_tier === 'IMMEDIATE') groups['IMMEDIATE'].push(business);
      if (analysis?.priority_tier === 'HIGH') groups['HIGH'].push(business);
      if (analysis?.priority_tier === 'MEDIUM') groups['MEDIUM'].push(business);
      if (analysis?.priority_tier === 'LOW') groups['LOW'].push(business);
    }

    // Sort within each tier by priority_score descending
    for (const key of Object.keys(groups)) {
      groups[key].sort((a: any, b: any) => {
        const scoreA = a.website_analyses?.[0]?.priority_score ?? 0;
        const scoreB = b.website_analyses?.[0]?.priority_score ?? 0;
        return scoreB - scoreA;
      });
    }

    return groups;
  }, [businesses]);

  const handleViewSales = (business: any) => {
    setSelectedBusiness(business);
    setModalOpen(true);
  };

  const handleViewAnalysis = (business: any) => {
    // Navigates to the new Lead Workspace page
    if (business.project_id) {
      navigate(`/projects/${business.project_id}/lead/${business.id}`);
    }
  };

  const handleGenerateSales = (businessId: string) => {
    salesMutation.mutate({ businessId, language: 'en' });
  };

  if (isLoading) {
    return <div className="text-center py-10 text-muted-foreground">Loading pipeline...</div>;
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

  const tabs = [
    { value: 'OVERVIEW', label: 'Overview' },
    { value: 'NOT_ANALYZED', label: 'Not Analyzed' },
    { value: 'READY_FOR_ANALYSIS', label: 'Ready' },
    { value: 'ANALYZED', label: 'Analyzed' },
    { value: 'SALES_READY', label: 'Sales Ready' },
    { value: 'IMMEDIATE', label: 'Immediate', color: 'text-red-500' },
    { value: 'HIGH', label: 'High', color: 'text-amber-500' },
    { value: 'MEDIUM', label: 'Medium', color: 'text-yellow-500' },
    { value: 'LOW', label: 'Low' },
  ];

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-end">
        <ExportButton businesses={businesses} />
      </div>

      <Tabs defaultValue="OVERVIEW" className="w-full">
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex w-max min-w-full justify-start border bg-muted/50 p-1">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className={`gap-2 min-w-fit px-4 ${tab.color || ''}`}>
                {tab.label}
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 h-4">
                  {tabGroups[tab.value]?.length || 0}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4 outline-none">
            {tabGroups[tab.value]?.length === 0 ? (
              <Card>
                <CardContent className="text-center py-16 text-muted-foreground">
                  No businesses match this filter.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tabGroups[tab.value].map((business: any) => (
                  <PipelineCard
                    key={business.id}
                    business={business}
                    onAnalyze={(id) => analyzeMutation.mutate(id)}
                    onGenerateSales={handleGenerateSales}
                    onViewSales={handleViewSales}
                    onViewAnalysis={handleViewAnalysis}
                    isAnalyzing={analyzeMutation.isPending && analyzeMutation.variables === business.id}
                    isGenerating={salesMutation.isPending && salesMutation.variables?.businessId === business.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Sales Assets Modal */}
      <SalesAssetsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        businessName={selectedBusiness?.name || ''}
        priorityTier={selectedBusiness?.website_analyses?.[0]?.priority_tier}
        nextAction={selectedBusiness?.website_analyses?.[0]?.next_action}
        salesAssets={selectedBusiness?.generated_messages?.[0] || null}
      />
    </div>
  );
}
