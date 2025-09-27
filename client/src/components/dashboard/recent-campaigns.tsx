import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

const apiUrl = import.meta.env.VITE_API_URL;
export function RecentCampaigns() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: campaigns, isLoading } = useQuery<Array<{id: string, name: string, description: string, status?: string}>>({
    queryKey: [`${apiUrl}/api/email-campaigns`],
  });

  // Edit dialog state
  const [editingCampaign, setEditingCampaign] = React.useState<any | null>(null);
  const [editForm, setEditForm] = React.useState({ name: "", description: "" });
  const [editLoading, setEditLoading] = React.useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = React.useState<string | null>(null);

  // Mutations
  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string; description: string } }) => {
  const res = await apiRequest("PUT", `${apiUrl}/email-campaigns/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/email-campaigns`] });
      setEditingCampaign(null);
      toast({ title: "Campaign updated", description: "Draft campaign updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });
  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
  const res = await apiRequest("DELETE", `${apiUrl}/api/email-campaigns/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/email-campaigns`] });
      toast({ title: "Campaign deleted", description: "Draft campaign deleted successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (campaign: any) => {
    setEditingCampaign(campaign);
    setEditForm({ name: campaign.name, description: campaign.description || "" });
  };
  const handleEditSave = () => {
    if (!editingCampaign) return;
    if (!editForm.name.trim()) {
      toast({ title: "Validation error", description: "Campaign name is required.", variant: "destructive" });
      return;
    }
    setEditLoading(true);
    updateCampaignMutation.mutate({ id: editingCampaign.id, data: { name: editForm.name, description: editForm.description } });
    setEditLoading(false);
  };
  const handleDelete = (campaign: any) => {
    if (!window.confirm("Are you sure you want to delete this draft campaign? This action cannot be undone.")) return;
    setDeleteLoadingId(campaign.id);
    deleteCampaignMutation.mutate(campaign.id, {
      onSettled: () => setDeleteLoadingId(null),
    });
  };

  if (isLoading) {
    return (
      <div className="lg:col-span-2 bg-card rounded-lg border border-border">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle data-testid="text-recent-campaigns-title">Recent Campaigns</CardTitle>
            <Link to="/email-campaigns">
              <Button variant="link" className="p-0 h-auto" data-testid="link-view-all-campaigns">View all</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </div>
    );
  }

  return (
    <div className="lg:col-span-2 bg-card rounded-lg border border-border" data-testid="recent-campaigns">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <CardTitle data-testid="text-recent-campaigns-title">Recent Campaigns</CardTitle>
          <Link to="/email-campaigns">
            <Button variant="link" className="p-0 h-auto" data-testid="link-view-all-campaigns">View all</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {!campaigns || campaigns.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-bullhorn text-muted-foreground text-2xl"></i>
            </div>
            <h3 className="font-medium mb-2" data-testid="text-no-campaigns-title">No campaigns yet</h3>
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-campaigns-description">
              Create your first campaign to start reaching out to leads
            </p>
            <Button data-testid="button-create-first-campaign" style={{ display: 'none' }}>
              <i className="fas fa-plus mr-2"></i>
              Create Campaign
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.slice(0, 3).map((campaign: any, index: number) => (
              <div 
                key={campaign.id} 
                className="flex items-center justify-between p-4 bg-muted rounded-lg"
                data-testid={`campaign-item-${index}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    index === 0 ? 'bg-primary' : 
                    index === 1 ? 'bg-chart-1' : 'bg-chart-3'
                  }`}>
                    <i className="fas fa-bullhorn text-white text-sm"></i>
                  </div>
                  <div>
                    <h3 className="font-medium" data-testid={`text-campaign-name-${index}`}>{campaign.name}</h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-campaign-description-${index}`}>
                      {campaign.description || "No description"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium" data-testid={`text-campaign-sent-${index}`}>0</span>
                      <span className="text-xs text-muted-foreground">sent</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-chart-2" data-testid={`text-campaign-responses-${index}`}>0</span>
                      <span className="text-xs text-muted-foreground">responses</span>
                    </div>
                  </div>
                  {/* Show edit/delete only for drafts */}
                  {campaign.status === 'draft' && (
                    <>
                      <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => handleEdit(campaign)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => handleDelete(campaign)} disabled={deleteLoadingId === campaign.id}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
      {/* Edit Campaign Dialog */}
      <Dialog open={!!editingCampaign} onOpenChange={() => setEditingCampaign(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Draft Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-campaign-name">Campaign Name</Label>
              <Input
                id="edit-campaign-name"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-campaign-description">Description</Label>
              <Textarea
                id="edit-campaign-description"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingCampaign(null)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={editLoading || updateCampaignMutation.isPending}>
                {updateCampaignMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </div>
  );
}
