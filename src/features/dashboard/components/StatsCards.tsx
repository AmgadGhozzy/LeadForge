import { 
  Building2, Sparkles, Target, TrendingUp, CheckCircle, 
  Flame, Star, CircleDot, AlertCircle, Search, 
  Globe, Phone, MessageCircle, Mail
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardStats } from '@/features/dashboard/hooks/use-dashboard-stats';

export function StatsCards({ projectId }: { projectId: string | undefined }) {
  const { stats, isLoading } = useDashboardStats(projectId);

  if (isLoading) return null;

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Total Businesses</p>
            <Building2 className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold">{stats.totalBusinesses}</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Ready for Analysis</p>
            <Target className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-500">{stats.readyForAnalysis}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Analyzed</p>
            <CheckCircle className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-500">{stats.analyzed}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Sales Generated</p>
            <Sparkles className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-indigo-500">{stats.salesGenerated}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Avg Lead Score</p>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-500">{stats.avgLeadScore}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Immediate</p>
            <Flame className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-500">{stats.immediate}</div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">High Priority</p>
            <Star className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{stats.high}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Medium Priority</p>
            <CircleDot className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="text-2xl font-bold text-yellow-500">{stats.medium}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Missing Website</p>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-muted-foreground">{stats.missingWebsite}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Missing Phone</p>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-muted-foreground">{stats.missingPhone}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Missing WhatsApp</p>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-muted-foreground">{stats.missingWhatsApp}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between space-x-2 pb-2">
            <p className="text-xs font-medium text-muted-foreground leading-none">Missing Analysis</p>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold text-muted-foreground">{stats.missingAnalysis}</div>
        </CardContent>
      </Card>
    </div>
  );
}
