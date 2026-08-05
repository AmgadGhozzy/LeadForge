import { useOperationalStats } from '../hooks/use-operational-stats';
import { Card, CardContent } from '@/components/ui/card';
import { Database, CheckCircle, AlertTriangle, MessageSquareText, TrendingUp, Zap } from 'lucide-react';

interface OperationalStatsProps {
  projectId: string | undefined;
}

export function OperationalStats({ projectId }: OperationalStatsProps) {
  const { data: stats, isLoading } = useOperationalStats(projectId);

  if (isLoading || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-1/2 mb-2" />
              <div className="h-8 bg-muted rounded w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const items = [
    {
      title: 'Total Imported',
      value: stats.imported,
      icon: Database,
      color: 'text-blue-500',
    },
    {
      title: 'Successfully Analyzed',
      value: stats.analyzed,
      icon: CheckCircle,
      color: 'text-emerald-500',
    },
    {
      title: 'Failed Analysis',
      value: stats.failed,
      icon: AlertTriangle,
      color: 'text-amber-500',
    },
    {
      title: 'Sales Generated',
      value: stats.salesGenerated,
      icon: MessageSquareText,
      color: 'text-purple-500',
    },
    {
      title: 'Avg Lead Score',
      value: `${stats.avgLeadScore}/100`,
      icon: TrendingUp,
      color: 'text-indigo-500',
    },
    {
      title: "Today's API Calls",
      value: stats.todayGeminiCalls,
      icon: Zap,
      color: 'text-yellow-500',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
      {items.map((item, index) => (
        <Card key={index}>
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between space-x-2 pb-2">
              <p className="text-xs font-medium text-muted-foreground leading-none">
                {item.title}
              </p>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <div className="text-2xl font-bold">
              {item.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
