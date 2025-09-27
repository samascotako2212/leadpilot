import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton"; 

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function StatsCards() {
  const { data: stats, isLoading } = useQuery<{sent: number, accepted: number, replied: number, failed: number}>({
    queryKey: [`${apiUrl}/api/campaigns/stats`],
  });

  const totalLeads = (stats?.sent || 0) + (stats?.accepted || 0) + (stats?.replied || 0) + (stats?.failed || 0);
  const responseRate = totalLeads > 0 ? ((stats?.replied || 0) / totalLeads * 100).toFixed(1) : "0.0";

  const cards = [
    {
      title: "Total Leads",
      value: totalLeads,
      icon: "fas fa-users",
      color: "text-primary",
      change: "+12% from last month",
      testId: "card-total-leads"
    },
    {
      title: "Messages Sent",
      value: stats?.sent || 0,
      icon: "fas fa-paper-plane",
      color: "text-chart-1",
      change: "+8% from last month",
      testId: "card-messages-sent"
    },
    {
      title: "Response Rate",
      value: `${responseRate}%`,
      icon: "fas fa-reply",
      color: "text-chart-2",
      change: "+2.1% from last month",
      testId: "card-response-rate"
    },
    {
      title: "Connections",
      value: stats?.accepted || 0,
      icon: "fas fa-handshake",
      color: "text-chart-4",
      change: "+15% from last month",
      testId: "card-connections"
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card) => (
        <Card key={card.title} data-testid={card.testId}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground" data-testid={`text-${card.testId}-title`}>
                {card.title}
              </h3>
              <i className={`${card.icon} ${card.color}`}></i>
            </div>
            <div className="text-2xl font-bold" data-testid={`text-${card.testId}-value`}>
              {card.value}
            </div>
            <p className="text-xs text-muted-foreground" data-testid={`text-${card.testId}-change`}>
              {card.change}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
