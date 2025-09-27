import { useState,useEffect,useRef } from "react";
import { Badge } from "@/components/ui/badge"; 
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid} from "recharts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";  

import { apiRequest } from "../lib/queryClient";
import { Loader2, Search, Filter, Download, Upload, Eye, Edit, Globe,Sparkles, Plus, Edit3, Trash2, Mail, Clock, Zap, Target, MessageCircle, Settings} from "lucide-react";

const apiUrl = import.meta.env.VITE_API_URL;
 
export default function EmailCampaigns() { 
  const [followUps, setFollowUps] = useState([]);

  const [editingFollowUpIdx, setEditingFollowUpIdx] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
 
  const [activeTab, setActiveTab] = useState("basic"); 

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const dialogRef = useRef(null);

  const handleMouseDown = (e) => {
    // Only allow dragging from the header area
    if (e.target.closest('.drag-handle')) {
      setIsDragging(true);
      const rect = dialogRef.current?.getBoundingClientRect();
      setDragStart({
        x: e.clientX - (rect?.left || 0),
        y: e.clientY - (rect?.top || 0)
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && dialogRef.current) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      
      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dialogRect = dialogRef.current.getBoundingClientRect();
      
      // Constrain to viewport bounds
      const constrainedX = Math.min(Math.max(newX, -dialogRect.width / 2), viewportWidth - dialogRect.width / 2);
      const constrainedY = Math.min(Math.max(newY, 0), viewportHeight - 100); // Keep at least 100px visible
      
      setDialogPosition({ x: constrainedX, y: constrainedY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Add event listeners for mouse move and up
  useState(() => {
    const handleGlobalMouseMove = (e) => handleMouseMove(e);
    const handleGlobalMouseUp = () => handleMouseUp();

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.body.style.userSelect = '';
    };
  }, [isDragging, dragStart]);


  const handleGenerateAiMessage = async () => {
    setAiLoading(true);
    setAiMessage(""); // Clear previous message
    
    try {
      // Get token from localStorage (or your auth provider)
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${apiUrl}/api/generate-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          leadInfo: `Subject: ${form.subject}, Body: ${form.body}`,
          ...aiPrompt,
          type: "email"
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setAiMessage(data.message);
        } else {
          // Fallback to mock message if no message in response
          setAiMessage(generateMockMessage());
        }
      } else {
        // Fallback to mock message if API fails
        setAiMessage(generateMockMessage());
      }
    } catch (error) {
      console.error('AI generation error:', error);
      // Fallback to mock message
      setAiMessage(generateMockMessage());
    } finally {
      setAiLoading(false);
    }
  };

  const generateMockMessage = () => {
    const mockMessages = [
      "Subject: Exploring Partnership Opportunities\n\nHi [First Name],\n\nI hope this email finds you well. I came across [Company] and was impressed by your recent work in [Industry]. I believe there might be some exciting partnership opportunities we could explore together.\n\nWould you be open to a brief 15-minute call next week to discuss how we might collaborate?\n\nBest regards,\n[Your Name]",
      "Subject: Quick Question About [Company]\n\nHi [First Name],\n\nI've been following [Company]'s growth and wanted to reach out with a quick question. We're working on some innovative solutions in [Industry] that might align with your goals.\n\nWould you have 10 minutes for a brief chat this week?\n\nThanks,\n[Your Name]",
      "Subject: Introduction and Potential Collaboration\n\nHello [First Name],\n\nI hope you're having a great week! I noticed your work at [Company] and thought there might be some synergies with what we're doing.\n\nI'd love to share how we're helping companies like yours achieve [specific benefit]. Are you available for a quick call?\n\nBest,\n[Your Name]"
    ];
    return mockMessages[Math.floor(Math.random() * mockMessages.length)];
  };
  const addFollowUp = () => {
    if (!followUpDraft.subject.trim() || !followUpDraft.body.trim()) return;
    
    if (editingFollowUpIdx !== null) {
      setFollowUps(followUps.map((fu, i) => i === editingFollowUpIdx ? followUpDraft : fu));
      setEditingFollowUpIdx(null);
    } else {
      setFollowUps([...followUps, followUpDraft]);
    }
    setFollowUpDraft({ subject: "", body: "", delay_days: 1 });
  };

  const editFollowUp = (index) => {
    setFollowUpDraft(followUps[index]);
    setEditingFollowUpIdx(index);
  };

  const deleteFollowUp = (index) => {
    setFollowUps(followUps.filter((_, i) => i !== index));
  };

  const applyAiMessage = () => {
    const lines = aiMessage.split('\n');
    const subjectLine = lines.find(line => line.startsWith('Subject:'));
    if (subjectLine) {
      setForm(f => ({ ...f, subject: subjectLine.replace('Subject:', '').trim() }));
    }
    const bodyLines = lines.filter(line => !line.startsWith('Subject:'));
    setForm(f => ({ ...f, body: bodyLines.join('\n').trim() }));
  };

  const tabs = [
    { id: "basic", label: "Campaign Details", icon: Mail },
    { id: "ai", label: "AI Assistant", icon: Sparkles },
    { id: "followup", label: "Follow-up Sequence", icon: Clock },
  ];
  // Chart data state and API call
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["http://localhost:8000/api/email-campaigns/performance"],
    queryFn: async () => {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${apiUrl}/api/email-campaigns/performance`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      return await res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  // Fallback to mock data if API fails or is loading
  const mockChartData = [
    { date: "2025-09-01", sent: 10, responses: 2 },
    { date: "2025-09-02", sent: 15, responses: 3 },
    { date: "2025-09-03", sent: 20, responses: 5 },
    { date: "2025-09-04", sent: 18, responses: 4 },
    { date: "2025-09-05", sent: 25, responses: 7 }
  ];
  // Helper for status badge color
  function getStatusColor(status: string) {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-800";
      case "active":
        return "bg-green-100 text-green-800";
      case "paused":
        return "bg-yellow-100 text-yellow-800";
      case "completed":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  } 

  // Status change mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `${apiUrl}/api/email-campaigns/${id}`, { status });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["http://localhost:8000/api/email-campaigns"] });
      toast.toast({ title: "Status Changed", description: `Campaign status changed to ${data.status}` });
    },
    onError: (error: any) => {
      toast.toast({ title: "Status Change Failed", description: error.message, variant: "destructive" });
    },
  });

  // Status change handler
  function handleStatusChange(id: number, newStatus: string) {
    statusMutation.mutate({ id, status: newStatus });
  }
  // AI Message Generator State
  const [aiSubject, setAiSubject] = useState("");
  const [aiBody, setAiBody] = useState("");
  const [aiPrompt, setAiPrompt] = useState({ goal: "email", tone: "friendly", personalization: "", cta: "", length: 300 });
   // Edit dialog state for drafts
  const [editingDraft, setEditingDraft] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", subject: "", body: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const [enrichmentFilter, setEnrichmentFilter] = useState<"all" | "enriched" | "not_enriched">("all");
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "active" | "paused" | "completed">("all");

  // Edit mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof editForm }) => {
      const res = await apiRequest("PUT", `${apiUrl}/api/email-campaigns/${id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      setEditingDraft(null);
      queryClient.invalidateQueries({ queryKey: ["http://localhost:8000/api/email-campaigns"] });
      toast.toast({ title: "Draft updated", description: "Draft email campaign updated successfully." });
    },
    onError: (error: any) => {
      toast.toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });
  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `${apiUrl}/api/email-campaigns/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["http://localhost:8000/api/email-campaigns"] });
      toast.toast({ title: "Draft deleted", description: "Draft email campaign deleted successfully." });
    },
    onError: (error: any) => {
      toast.toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const handleEditDraft = (c: any) => {
    setEditingDraft(c);
    setEditForm({ name: c.name, subject: c.subject, body: c.body });
  };
  const handleEditSave = () => {
    if (!editingDraft) return;
    if (!editForm.name.trim() || !editForm.subject.trim() || !editForm.body.trim()) {
      toast.toast({ title: "Validation error", description: "All fields are required.", variant: "destructive" });
      return;
    }
    setEditLoading(true);
    updateMutation.mutate({ id: editingDraft.id, data: editForm });
    setEditLoading(false);
  };
  const handleDeleteDraft = (c: any) => {
    if (!window.confirm("Are you sure you want to delete this email campaign? This action cannot be undone.")) return;
    setDeleteLoadingId(c.id);
    deleteMutation.mutate(c.id, {
      onSettled: () => setDeleteLoadingId(null),
    });
  };
  const { data: campaigns, isLoading } = useQuery<any[]>({
    queryKey: ["http://localhost:8000/api/email-campaigns"],
  });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", subject: "", body: "" });
  // Follow-up email draft state
  const [followUpDraft, setFollowUpDraft] = useState({ subject: "", body: "", delay_days: 1 });
  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      // Only send follow_ups if present
      const payload = { ...data };
      const res = await apiRequest("POST", `${apiUrl}/api/email-campaigns`, payload);
      return await res.json();
    },
    onSuccess: () => {
      setShowCreate(false);
      setForm({ name: "", subject: "", body: ""});
      setFollowUpDraft({ subject: "", body: "", delay_days: 1 });
      queryClient.invalidateQueries({ queryKey: ["http://localhost:8000/api/email-campaigns"] });
    },
  });
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendCampaign, setSendCampaign] = useState<any>(null);
  const [sendLeads, setSendLeads] = useState<any[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [personalization, setPersonalization] = useState<{ [leadId: string]: { first_name: string; company: string } }>({});
  const [sending, setSending] = useState(false);
  // Batch selection for send dialog
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  // (removed duplicate toast declaration)
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [logsCampaign, setLogsCampaign] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  // Fetch leads when send dialog opens
  useEffect(() => {
    if (sendDialogOpen) {
      (async () => {
        const res = await apiRequest("GET", `${apiUrl}/api/leads/batches`);
        const data = await res.json();
        setBatches(data.batches || []);
        setSelectedBatchId("");
        setSendLeads([]);
        setSelectedLeadIds([]);
      })();
    }
  }, [sendDialogOpen]);

  // Fetch leads for selected batch
  useEffect(() => {
    if (sendDialogOpen && selectedBatchId) {
      (async () => {
        const res = await apiRequest("GET", `${apiUrl}/api/leads/list?batch_id=${selectedBatchId}`);
        const data = await res.json();
        setSendLeads(data.leads || []);
        setPersonalization(
          Object.fromEntries((data.leads || []).map((l: any) => [l.id, { first_name: l.first_name, company: l.company }]))
        );
        setSelectedLeadIds((data.leads || []).map((l: any) => l.id));
      })();
    } else {
      setSendLeads([]);
      setSelectedLeadIds([]);
    }
  }, [sendDialogOpen, selectedBatchId]);
  // Fetch logs when dialog opens
  useEffect(() => {
    if (logsDialogOpen && logsCampaign) {
      setLogsLoading(true);
      apiRequest("GET", `${apiUrl}/api/email-campaigns/${logsCampaign.id}/logs`)
        .then(res => res.json())
        .then(data => setLogs(data))
        .finally(() => setLogsLoading(false));
    }
  }, [logsDialogOpen, logsCampaign]);
  // Send handler
  const handleSend = async () => {
    setSending(true);
    try {
      const res = await apiRequest("POST", `${apiUrl}/api/email-campaigns/${sendCampaign.id}/send`, {
        leadIds: selectedLeadIds,
        personalization,
      });
      const data = await res.json();
  toast.toast({ title: "Emails sent", description: data.message });
      setSendDialogOpen(false);
    } catch (e: any) {
  toast.toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };


  // Filtered campaigns based on search and status
  const filteredCampaigns = (campaigns || []).filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-blue-700 mb-1">Email Campaigns</h1>
          <p className="text-muted-foreground">Manage your email outreach campaigns</p>
        </header>
        {/* Performance Over Time Card - full width, reduced height, title above */}
        <div className="mb-6">
          <div className="font-semibold text-lg mb-2">Performance Over Time</div>
          <Card className="w-full shadow-sm">
            <CardContent className="p-4">
              <div className="h-40">
                {chartLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading chart...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={Array.isArray(chartData) && chartData.length > 0 ? chartData : mockChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="sent" stroke="#2563eb" name="Sent" />
                      <Line type="monotone" dataKey="responses" stroke="#10b981" name="Responses" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex flex-col md:flex-row gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Input
                    placeholder="Search email campaigns..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as "all" | "draft" | "active" | "paused" | "completed")}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="all">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <Button onClick={() => setShowCreate(true)}>Create Email Campaign</Button>
            </div>
          </CardContent>
        </Card>

        {/* Campaigns Grid with stats and actions */}
        {filteredCampaigns.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="p-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-envelope text-muted-foreground text-2xl"></i>
                </div>
                <h3 className="font-medium mb-2">No email campaigns found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchTerm || statusFilter !== "all" 
                    ? "Try adjusting your search or filter criteria"
                    : "Create your first email campaign to start organizing your outreach efforts"
                  }
                </p>
                <Button onClick={() => setShowCreate(true)}>
                  Create Email Campaign
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCampaigns.map((c) => (
              <Card key={c.id} className="shadow-md border border-blue-200 hover:shadow-lg transition-all duration-200 bg-white">
                <CardHeader className="pb-2 border-b border-blue-100 bg-blue-50 rounded-t">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg text-blue-800">{c.name}</CardTitle>
                      <div className="text-sm text-muted-foreground">{c.subject}</div>
                    </div>
                    <Badge className={getStatusColor(c.status)}>{c.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 text-center mb-2">
                      <div>
                        <div className="text-2xl font-bold text-blue-700">{c.leads_count || 0}</div>
                        <div className="text-xs text-muted-foreground">Leads</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-chart-1">{c.messages_sent || 0}</div>
                        <div className="text-xs text-muted-foreground">Sent</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-600">{c.responses || 0}</div>
                        <div className="text-xs text-muted-foreground">Responses</div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 justify-end mt-2">
                      <Button
                        variant={c.status === 'active' ? 'destructive' : 'default'}
                        size="sm"
                        className={c.status === 'active' ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}
                        onClick={() => handleStatusChange(c.id, c.status === "active" ? "paused" : "active")}
                        data-testid={`button-campaign-status-${c.id}`}
                      >
                        {c.status === "active" ? "Pause" : "Activate"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => handleEditDraft(c)}
                        data-testid={`button-campaign-edit-${c.id}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => handleDeleteDraft(c)}
                        disabled={deleteLoadingId === c.id}
                        data-testid={`button-campaign-delete-${c.id}`}
                      >
                        {deleteLoadingId === c.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Delete
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={() => { setSendCampaign(c); setSendDialogOpen(true); }}
                        data-testid={`button-campaign-send-${c.id}`}
                      >
                        Send Emails
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Campaign Dialog */}
        <Dialog open={!!editingDraft} onOpenChange={open => { if (!open) setEditingDraft(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Campaign Name"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
              <Input
                placeholder="Subject"
                value={editForm.subject}
                onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
              />
              <Textarea
                placeholder="Email Body"
                value={editForm.body}
                onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))}
                rows={6}
              />
            </div>
            <DialogFooter>
              <Button onClick={handleEditSave} disabled={editLoading}>
                {editLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setEditingDraft(null)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Emails Dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={open => { if (!open) setSendDialogOpen(false); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send Emails for Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Select Lead Batch</label>
                <select
                  className="w-full border rounded px-2 py-2 mb-2"
                  value={selectedBatchId}
                  onChange={e => setSelectedBatchId(e.target.value)}
                >
                  <option value="">-- Select Batch --</option>
                  {batches.map((batch: any) => (
                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                  ))}
                </select>
              </div>
              <div className="font-medium">Select Leads to Send</div>
              <div className="max-h-64 overflow-y-auto border rounded p-2 bg-gray-50">
                {!selectedBatchId ? (
                  <div className="text-center text-muted-foreground">Select a batch to view leads.</div>
                ) : sendLeads.length === 0 ? (
                  <div className="text-center text-muted-foreground">No leads available for this batch.</div>
                ) : (
                  sendLeads.map((lead: any) => (
                    <div key={lead.id} className="flex items-center gap-2 py-1 border-b last:border-b-0">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedLeadIds(ids => [...ids, lead.id]);
                          else setSelectedLeadIds(ids => ids.filter(id => id !== lead.id));
                        }}
                      />
                      <span className="font-medium">{lead.first_name} {lead.last_name}</span>
                      <span className="text-xs text-muted-foreground">{lead.company}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSend} disabled={sending || selectedLeadIds.length === 0}>
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send Emails
              </Button>
              <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

       {/* Create Email Campaign Modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
      <DialogContent 
       
      >
        <DialogHeader className="px-8 py-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Mail className="h-6 w-6" />
            </div>
            Create Email Campaign
          </DialogTitle>
          <p className="text-blue-100 mt-2">Design your email campaign with AI assistance and automated follow-ups</p>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="px-8 pt-6 pb-0">
          <div className="flex space-x-1 bg-white/60 p-1 rounded-lg">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-md font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-blue-700 hover:bg-white/50'
                  }`}
                >
                  <IconComponent className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6 flex-1 overflow-y-auto">
          {/* Basic Campaign Details Tab */}
          {activeTab === "basic" && (
            <div className="space-y-6">
              <Card className="border-blue-200 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Campaign Configuration</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Campaign Name</label>
                      <Input
                        placeholder="e.g., Q4 Partnership Outreach"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        className="border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email Subject</label>
                      <Input
                        placeholder="e.g., Partnership opportunity with [Company]"
                        value={form.subject}
                        onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                        className="border-blue-200 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email Body</label>
                      <Textarea
                        placeholder="Write your email content here... Use placeholders like [First Name], [Company], etc."
                        value={form.body}
                        onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                        rows={8}
                        className="border-blue-200 focus:border-blue-500 focus:ring-blue-500 resize-none"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        💡 Tip: Use personalization tokens like [First Name], [Company], [Industry] for better engagement
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* AI Assistant Tab */}
          {activeTab === "ai" && (
            <div className="space-y-6">
              <Card className="border-purple-200 shadow-sm bg-gradient-to-br from-purple-50 to-pink-50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-gray-900">AI Message Generator</h3>
                    <Badge className="bg-purple-100 text-purple-700 ml-auto">Powered by AI</Badge>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Target className="h-4 w-4 inline mr-1" />
                          Personalization Context
                        </label>
                        <Input
                          placeholder="e.g., shared interests, company news, mutual connections"
                        value={aiPrompt.personalization}
                        onChange={e => setAiPrompt(p => ({ ...p, personalization: e.target.value }))}
                          className="border-purple-200 focus:border-purple-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Zap className="h-4 w-4 inline mr-1" />
                          Call to Action
                        </label>
                      <Input
                          placeholder="e.g., schedule a call, book a demo, download resource"
                        value={aiPrompt.cta}
                        onChange={e => setAiPrompt(p => ({ ...p, cta: e.target.value }))}
                          className="border-purple-200 focus:border-purple-500"
                      />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <MessageCircle className="h-4 w-4 inline mr-1" />
                        Tone of Voice
                      </label>
                      <select 
                        value={aiPrompt.tone} 
                        onChange={e => setAiPrompt(p => ({ ...p, tone: e.target.value }))} 
                        className="w-full border border-purple-200 rounded-md px-3 py-2 focus:border-purple-500 focus:ring-purple-500"
                      >
                        <option value="professional">Professional & Formal</option>
                        <option value="friendly">Friendly & Approachable</option>
                        <option value="casual">Casual & Conversational</option>
                        <option value="authoritative">Authoritative & Direct</option>
                        <option value="empathetic">Empathetic & Understanding</option>
                      </select>
                    </div>
                    
                    <Button 
                      onClick={handleGenerateAiMessage} 
                      disabled={aiLoading}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-3"
                    >
                      {aiLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating with AI...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Generate AI Message
                        </>
                      )}
                    </Button>
                    
                    {aiMessage && (
                      <Card className="border-green-200 bg-green-50">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-green-800">AI Generated Content</h4>
                            <Button 
                              size="sm" 
                              onClick={applyAiMessage}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              Apply to Campaign
                            </Button>
                      </div>
                          <div className="text-sm text-green-900 whitespace-pre-line bg-white p-3 rounded border border-green-200">
                            {aiMessage}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Follow-up Sequence Tab */}
          {activeTab === "followup" && (
            <div className="space-y-6">
              <Card className="border-orange-200 shadow-sm bg-gradient-to-br from-orange-50 to-yellow-50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-orange-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Automated Follow-up Sequence</h3>
                    <Badge className="bg-orange-100 text-orange-700 ml-auto">
                      {followUps.length} follow-ups
                    </Badge>
                  </div>
                  
                  {/* Existing Follow-ups */}
                  {followUps.length > 0 && (
                    <div className="space-y-3 mb-6">
                      <h4 className="text-sm font-medium text-gray-700">Your Follow-up Sequence:</h4>
                      {followUps.map((fu, idx) => (
                        <Card key={idx} className="border-orange-200 bg-white">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge className="bg-orange-100 text-orange-700 text-xs">
                                    Day {fu.delay_days}
                                  </Badge>
                                  <span className="font-medium text-gray-900">{fu.subject}</span>
                                </div>
                                <p className="text-sm text-gray-600 line-clamp-2">{fu.body}</p>
                              </div>
                              <div className="flex gap-1 ml-4">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => editFollowUp(idx)}
                                  className="border-orange-200 text-orange-600 hover:bg-orange-50"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={() => deleteFollowUp(idx)}
                                  className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                  
                  {/* Add/Edit Follow-up Form */}
                  <Card className="border-dashed border-2 border-orange-300 bg-white/50">
                    <CardContent className="p-4">
                      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        {editingFollowUpIdx !== null ? 'Edit Follow-up' : 'Add New Follow-up'}
                      </h4>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Days after previous email</label>
            <Input
                            type="number"
                            min={1}
                            placeholder="3"
                            value={followUpDraft.delay_days}
                            onChange={e => setFollowUpDraft(f => ({ ...f, delay_days: Number(e.target.value) }))}
                            className="border-orange-200 focus:border-orange-500 w-24"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
            <Input
                            placeholder="Follow-up: Partnership opportunity with [Company]"
                            value={followUpDraft.subject}
                            onChange={e => setFollowUpDraft(f => ({ ...f, subject: e.target.value }))}
                            className="border-orange-200 focus:border-orange-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email Content</label>
            <Textarea
                            placeholder="Hi [First Name],&#10;&#10;I wanted to follow up on my previous email about..."
                            value={followUpDraft.body}
                            onChange={e => setFollowUpDraft(f => ({ ...f, body: e.target.value }))}
                            rows={4}
                            className="border-orange-200 focus:border-orange-500 resize-none"
                          />
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            onClick={addFollowUp}
                            disabled={!followUpDraft.subject.trim() || !followUpDraft.body.trim()}
                            className="bg-orange-600 hover:bg-orange-700 text-white"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {editingFollowUpIdx !== null ? 'Update Follow-up' : 'Add Follow-up'}
                          </Button>
                          
                          {editingFollowUpIdx !== null && (
                            <Button 
                              variant="outline" 
                              onClick={() => {
                                setFollowUpDraft({ subject: "", body: "", delay_days: 1 });
                                setEditingFollowUpIdx(null);
                              }}
                              className="border-orange-200 text-orange-600"
                            >
                              Cancel
                            </Button>
                          )}
          </div>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-8 py-6 bg-white border-t border-blue-200 rounded-b-lg">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-gray-500">
              {form.name && (
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  Campaign: {form.name}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowCreate(false)}
                className="border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => createMutation.mutate(form)}
                disabled={
                createMutation.status === "pending" ||
               !form.name.trim() ||
               !form.subject.trim() ||
               !form.body.trim()
                }
               className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 flex items-center"
              >
                {createMutation.status === "pending" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                 ) : (
                <Mail className="h-4 w-4 mr-2" />
                 )}
              Create Campaign
            </Button>
            </div>
          </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ...existing dialogs... */}
      {/* ...existing code... */}
    </main>
    </div>
    );
}
