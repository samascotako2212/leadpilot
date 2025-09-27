
import { Sidebar } from "@/components/dashboard/sidebar";
import { LeadPilotLogo } from "@/components/ui/LeadPilotLogo";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentCampaigns } from "@/components/dashboard/recent-campaigns";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { UploadModal } from "@/components/dashboard/upload-modal";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut } from "lucide-react";
import { NotificationDropdown } from "@/components/dashboard/notification-dropdown";
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";


export default function Dashboard() {
  const { user, logoutMutation } = useAuth();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const { data: usageRaw } = useQuery<{ tier: string; current_usage: number; limit: number; remaining: number }>({
    queryKey: [`${apiUrl}/api/subscriptions/usage`],
  });
  const usage = usageRaw && typeof usageRaw === 'object' && 'tier' in usageRaw ? usageRaw : undefined;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <LeadPilotLogo size={32} />
            <span className="hidden sm:inline text-xl font-bold text-blue-700">LeadPilot Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Notification Dropdown */}
            {user?.id && <NotificationDropdown userId={user.id} />}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium" data-testid="text-user-email">{user?.email}</span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => logoutMutation.mutate()}
                aria-label="Logout"
                data-testid="button-logout"
              >
                <LogOut className="h-5 w-5 text-red-500" />
              </Button>
            </div>
          </div>
        </header>

        <StatsCards />

        {/* Usage Overview */}
        {usage && (
          <Card className="mb-6 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Usage Overview</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {usage.tier.toUpperCase()} Plan
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Leads Used</span>
                    <span className={usage.current_usage > usage.limit ? 'text-red-700 font-bold' : ''}>
                      {usage.current_usage} / {usage.limit}
                      {usage.current_usage > usage.limit && <span className="ml-2">Over Limit</span>}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        usage.current_usage > usage.limit
                          ? 'bg-red-500'
                          : usage.current_usage >= usage.limit * 0.8
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(100, (usage.current_usage / usage.limit) * 100)}%` }}
                    ></div>
                  </div>
                </div>
                {(usage.current_usage >= usage.limit * 0.8 || usage.current_usage > usage.limit) && (
                  <div className={`flex flex-col sm:flex-row items-center justify-between p-3 rounded-md gap-2 ${usage.current_usage > usage.limit ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                    <div>
                      <p className={`text-sm font-medium ${usage.current_usage > usage.limit ? 'text-red-800' : 'text-yellow-800'}`}>
                        {usage.current_usage > usage.limit ? 'Over Limit' : usage.current_usage >= usage.limit ? 'Limit Reached' : 'Approaching Limit'}
                      </p>
                      <p className={`text-xs ${usage.current_usage > usage.limit ? 'text-red-600' : 'text-yellow-600'}`}>
                        {usage.current_usage > usage.limit
                          ? 'You have exceeded your monthly credit limit!'
                          : `${usage.remaining} leads remaining`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={usage.current_usage > usage.limit ? "destructive" : usage.current_usage >= usage.limit ? "destructive" : "outline"}
                      onClick={() => window.location.href = "/pricing"}
                    >
                      {usage.current_usage > usage.limit ? 'Upgrade Now' : usage.current_usage >= usage.limit ? 'Upgrade Now' : 'Upgrade Plan'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <RecentCampaigns />
          <div className="space-y-6">
            <QuickActions onUploadClick={() => setShowUploadModal(true)} />
          </div>
        </div>

        <RecentActivity />
      </main>

      <UploadModal 
        isOpen={showUploadModal} 
        onClose={() => setShowUploadModal(false)} 
      />
    </div>
  );
}
