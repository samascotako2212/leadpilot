import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Filter, Download, Upload, Eye, Edit, Trash2, Globe, ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, History,Trash } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
interface Lead {
  id: number;
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  profile_url: string;
  status: string;
  message_text?: string;
  email?: string;
  email_confidence?: number;
    campaign_id: number;
  }
export default function Leads() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrichErrors, setEnrichErrors] = useState<{[leadId: number]: string}>({});
  const enrichEmailMutation = useMutation({
    mutationFn: async (leadId: number) => {
  const res = await apiRequest("POST", `${apiUrl}/api/leads/enrich-email`, { leadId });
      return await res.json();
    },
    onSuccess: (data, leadId) => {
      queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/leads/list`] });
      if (data.email) {
        toast({ title: "Email enriched", description: `Email: ${data.email} (Confidence: ${data.confidence})` });
        setEnrichErrors(prev => ({ ...prev, [leadId]: "" }));
      } else {
        setEnrichErrors(prev => ({ ...prev, [leadId]: data.message || "No email found." }));
        toast({ title: "Enrichment failed", description: data.message || "No email found.", variant: "destructive" });
      }
    },
    onError: (error: Error, leadId) => {
      setEnrichErrors(prev => ({ ...prev, [leadId]: error.message }));
      toast({ title: "Enrichment failed", description: error.message, variant: "destructive" });
    },
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [enrichmentFilter, setEnrichmentFilter] = useState("all");
  // Removed campaignFilter state
  const [selectedLeads, setSelectedLeads] = useState<number[]>([]);
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [scrapeForm, setScrapeForm] = useState({
    keywords: "",
    industry: "",
    location: "",
    currentCompany: "",
    job_title: ""
  });
  // Removed web scrape modal and related states
  const [showUnassigned, setShowUnassigned] = useState(false);
  // Removed campaign assignment state per requirement
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [companyFilter, setCompanyFilter] = useState("");
  const [jobTitleFilter, setJobTitleFilter] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [backgroundTasks, setBackgroundTasks] = useState<{[key: string]: {status: string, result?: any}}>({});
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedLeadHistory, setSelectedLeadHistory] = useState<any[]>([]);
  const [historyLeadId, setHistoryLeadId] = useState<number | null>(null); 
  const [batch, setBatch] = useState<any[]>([]);

  
 const deleteBatchMutation = useMutation({
  mutationFn: async (id: number) => {
    const token = localStorage.getItem("access_token"); // or however you store it

    const res = await fetch(`/api/leads/batches/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // add auth header
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to delete batch");
    }

    return id;
  },
 onSuccess: (deletedId) => {
    // Refresh the batches query automatically
    queryClient.invalidateQueries(["batches"]);

    // Optional: clear selection if needed
    if (selectedBatchId === deletedId) {
      setSelectedBatchId(null);
    }
  },
});


  // Fetch lead batches for filter buttons
  type LeadBatch = { id: number; name: string; created_at?: string; count?: number };
  const { data: batchesData } = useQuery<{ batches: LeadBatch[] }>({
    queryKey: ["lead-batches"],
    queryFn: async () => {
      // Use stats endpoint for counts
      const res = await apiRequest("GET", `${apiUrl}/api/leads/batches-stats`);
      return await res.json();
    },
  });
  const batches: LeadBatch[] = batchesData?.batches || [];
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [showAllBatches, setShowAllBatches] = useState(false);

  // Sync selected batch with URL (?batch_id=)
  useEffect(() => {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("batch_id");
    if (param) {
      const id = Number(param);
      if (!Number.isNaN(id)) setSelectedBatchId(id);
    }
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedBatchId) {
      url.searchParams.set("batch_id", String(selectedBatchId));
    } else {
      url.searchParams.delete("batch_id");
    }
    navigate(`${url.pathname}${url.search}`, { replace: true });
  }, [selectedBatchId, navigate]);
  // Fetch leads with unassigned filter
  const { data: leadsData, isLoading, refetch } = useQuery<{leads: Lead[], total?: number}>({
    queryKey: [
      "leads-list",
      page,
      pageSize,
      showUnassigned,
      statusFilter,
      enrichmentFilter,
      searchTerm,
      companyFilter,
      jobTitleFilter,
      selectedBatchId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("offset", String(page * pageSize));
      params.append("limit", String(pageSize));
      if (showUnassigned) params.append("unassigned", "true");
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (enrichmentFilter === "enriched") params.append("enriched", "true");
      if (enrichmentFilter === "not_enriched") params.append("enriched", "false");
      if (searchTerm) params.append("search", searchTerm);
      if (companyFilter) params.append("company", companyFilter);
      if (jobTitleFilter) params.append("job_title", jobTitleFilter);
      if (selectedBatchId) params.append("batch_id", String(selectedBatchId));
      const res = await apiRequest("GET", `${apiUrl}/api/leads/list?${params.toString()}`);
      return await res.json();
    },
  });
  const leads: Lead[] = leadsData && Array.isArray(leadsData.leads) ? leadsData.leads : [];
  const totalLeads: number = leadsData && typeof leadsData.total === 'number' ? leadsData.total : leads.length;

  const { data: usage } = useQuery<{ current_usage: number; limit: number; tier: string }>({
    queryKey: [`${apiUrl}/api/subscriptions/usage`],
  });

  // Fetch lead history
  const { data: leadHistory, isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["lead-history", historyLeadId],
    queryFn: async () => {
      if (!historyLeadId) return [];
  const res = await apiRequest("GET", `${apiUrl}/api/leads/${historyLeadId}/history`);
      return await res.json();
    },
    enabled: !!historyLeadId,
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: number; status: string }) => {
  const res = await apiRequest("PUT", `${apiUrl}/api/leads/${leadId}`, { status });
      return await res.json();
    },
    onSuccess: (data) => {
  queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/leads/list`] });
  queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/subscriptions/usage`] });
      
      if (data.warning === "approaching_limit") {
        toast({
          title: "Approaching Limit",
          description: data.message,
          action: (
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/pricing"}>
              Upgrade Plan
            </Button>
          ),
        });
      } else if (data.warning === "limit_reached") {
        toast({
          title: "Limit Reached",
          description: data.message,
          variant: "destructive",
          action: (
            <Button variant="outline" size="sm" onClick={() => window.location.href = "/pricing"}>
              Upgrade Now
            </Button>
          ),
        });
      } else {
        toast({
          title: "Lead updated",
          description: "Lead status has been updated successfully.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
  const res = await apiRequest("DELETE", `${apiUrl}/api/leads/${leadId}`);
      return await res.json();
    },
    onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/leads/list`] });
      toast({
        title: "Lead deleted",
        description: "Lead has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add mutation for scraping LinkedIn leads
  const scrapeLeadsMutation = useMutation({
    mutationFn: async (filters: typeof scrapeForm) => {
  const res = await apiRequest("POST", `${apiUrl}/api/leads/scrape-linkedin-leads`, filters);
      return await res.json();
    },
    onSuccess: (data) => {
      setScrapeModalOpen(false);
      toast({
        title: "Scraping started",
        description: data.message || "LinkedIn lead scraping has been triggered.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Scraping failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk enrichment mutation
  const bulkEnrichMutation = useMutation({
    mutationFn: async (leadIds: number[]) => {
  const res = await apiRequest("POST", `${apiUrl}/api/leads/bulk-enrich-bg`, { leadIds });
      return await res.json();
    },
    onSuccess: (data) => {
      setBackgroundTasks(prev => ({...prev, [data.task_id]: {status: "pending"}}));
      toast({ title: "Bulk enrichment started", description: "Enrichment is running in the background. Check status below." });
    },
    onError: (error: Error) => {
      toast({ title: "Bulk enrichment failed", description: error.message, variant: "destructive" });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (leadIds: number[]) => {
  const res = await apiRequest("POST", `${apiUrl}/api/leads/bulk-delete`, { leadIds });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      toast({ title: "Bulk delete successful", description: data.message });
      setSelectedLeads([]);
    },
    onError: (error: Error) => {
      toast({ title: "Bulk delete failed", description: error.message, variant: "destructive" });
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ leadIds, updates }: { leadIds: number[], updates: any }) => {
  const res = await apiRequest("POST", `${apiUrl}/api/leads/bulk-update`, { leadIds, updates });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      toast({ title: "Bulk update successful", description: data.message });
      setSelectedLeads([]);
    },
    onError: (error: Error) => {
      toast({ title: "Bulk update failed", description: error.message, variant: "destructive" });
    },
  });

  // Export leads as CSV (with auth)
  const handleExport = async () => {
    const token = localStorage.getItem("access_token");
    const url = `${apiUrl}/api/leads/export?unassigned=${showUnassigned}`;
    if (!token) {
      toast({ title: "Not authenticated", description: "Please log in to export leads.", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed: " + res.statusText);
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = "leads.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  // Upload leads from file (CSV)
  const fileInputRef = useState(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.style.display = 'none';
    return input;
  })[0];

  // Show upload dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Removed uploadCampaign state
  const [uploadBatchName, setUploadBatchName] = useState("");
  const [uploadRowErrors, setUploadRowErrors] = useState<any[]>([]);

  const handleUploadClick = () => {
    if (fileInputRef) {
      fileInputRef.value = '';
      fileInputRef.onchange = (e: any) => handleFileChange(e);
      fileInputRef.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement> | Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      setPendingFile(input.files[0]);
      setUploadDialogOpen(true);
    }
  };

  // Read CSV and upload to backend
  const handleUploadLeads = async () => {
  if (!pendingFile || !uploadBatchName.trim()) return;
    setUploading(true);
    try {
      const text = await pendingFile.text();
      const res = await apiRequest("POST", `${apiUrl}/api/leads/upload`, {
        csvData: text,
        batch_name: uploadBatchName.trim(),
      });
      const data = await res.json();
      toast({ title: data.message, description: data.warning ? data.warning : undefined });
    setUploadRowErrors(Array.isArray(data.row_errors) ? data.row_errors : []);
    setUploadDialogOpen(false);
    setPendingFile(null);
  // Removed setUploadCampaign
    setUploadBatchName("");
    // Reset filters and pagination so new leads are visible
    setPage(0);
    setStatusFilter("all");
    setEnrichmentFilter("all");
    setSearchTerm("");
    setCompanyFilter("");
    setJobTitleFilter("");
    refetch();
      // Refresh batches after successful upload
      queryClient.invalidateQueries({ queryKey: ["lead-batches"] });
    queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/subscriptions/usage`] });
      // CTA: Offer to view the uploaded batch immediately
      const uploadedName = (uploadBatchName || "").trim();
      if (uploadedName) {
        // Try to find the batch after refetch delay
        setTimeout(async () => {
          try {
            const res = await apiRequest("GET", `${apiUrl}/api/leads/batches-stats`);
            const data = await res.json();
            const match = (data?.batches || []).find((b: any) => b.name === uploadedName);
            if (match) {
              toast({
                title: `Batch "${uploadedName}" created`,
                description: "Click to view this batch",
                action: (
                  <Button size="sm" variant="outline" onClick={() => setSelectedBatchId(match.id)}>
                    View batch
                  </Button>
                ),
              });
            }
          } catch {}
        }, 500);
      }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Bulk action handlers
  const handleBulkEnrich = () => {
    if (selectedLeads.length === 0) {
      toast({ title: "No leads selected", description: "Please select leads to enrich.", variant: "destructive" });
      return;
    }
    bulkEnrichMutation.mutate(selectedLeads);
  };

  const handleBulkDelete = () => {
    if (selectedLeads.length === 0) {
      toast({ title: "No leads selected", description: "Please select leads to delete.", variant: "destructive" });
      return;
    }
    if (confirm(`Are you sure you want to delete ${selectedLeads.length} leads?`)) {
      bulkDeleteMutation.mutate(selectedLeads);
    }
  };

  const handleBulkStatusUpdate = (newStatus: string) => {
    if (selectedLeads.length === 0) {
      toast({ title: "No leads selected", description: "Please select leads to update.", variant: "destructive" });
      return;
    }
    bulkUpdateMutation.mutate({ leadIds: selectedLeads, updates: { status: newStatus } });
  };

  const handleViewHistory = (leadId: number) => {
    setHistoryLeadId(leadId);
    setHistoryDialogOpen(true);
  };

  // Poll background task status
  useEffect(() => {
    const pollTasks = () => {
      Object.keys(backgroundTasks).forEach(async (taskId) => {
        if (backgroundTasks[taskId].status === "pending") {
          try {
            const res = await apiRequest("GET", `${apiUrl}/api/leads/task-status/${taskId}`);
            const data = await res.json();
            setBackgroundTasks(prev => ({...prev, [taskId]: data}));
            if (data.status === "done") {
              queryClient.invalidateQueries({ queryKey: ["leads-list"] });
              toast({ title: "Background task completed", description: "Enrichment results are now available." });
            } else if (data.status === "error") {
              toast({ title: "Background task failed", description: data.result, variant: "destructive" });
            }
          } catch (e) {
            console.error("Failed to poll task status:", e);
          }
        }
      });
    };
    const interval = setInterval(pollTasks, 2000);
    return () => clearInterval(interval);
  }, [backgroundTasks, queryClient, toast]);

  const filteredLeads = leads?.filter(lead => {
    const matchesSearch = 
      lead.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.job_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    const matchesEnrichment = enrichmentFilter === "all" || (enrichmentFilter === "enriched" ? !!lead.email : !lead.email);
    return matchesSearch && matchesStatus && matchesEnrichment;
  }) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "contacted":
        return "bg-blue-100 text-blue-800";
      case "replied":
        return "bg-green-100 text-green-800";
      case "connected":
        return "bg-purple-100 text-purple-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleStatusChange = (leadId: number, newStatus: string) => {
    updateLeadMutation.mutate({ leadId, status: newStatus });
  };

  const handleDeleteLead = (leadId: number) => {
    if (confirm("Are you sure you want to delete this lead?")) {
      deleteLeadMutation.mutate(leadId);
    }
  };

  const handleSelectLead = (leadId: number) => {
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const handleSelectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(lead => lead.id));
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-grid">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <header className="mb-8">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </header>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-blue-700 mb-1" data-testid="text-leads-title">Leads</h1>
            <p className="text-muted-foreground" data-testid="text-leads-description">
              Manage your LinkedIn leads and outreach status
            </p>
          </div>
        </header>

        {/* Usage Warning Banner */}
        {usage && usage.current_usage >= usage.limit * 0.8 && (
          <Card className={`mb-6 shadow-sm ${usage.current_usage >= usage.limit ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${usage.current_usage >= usage.limit ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                  <div>
                    <p className={`font-medium ${usage.current_usage >= usage.limit ? 'text-red-800' : 'text-yellow-800'}`}>
                      <strong>Usage:</strong> You can generate up to 100 leads per day. For higher limits, set up your Phantombuster API key in <a href="/settings" className="underline text-blue-700">Settings</a>.
                    </p>
                    <p className={`text-sm ${usage.current_usage >= usage.limit ? 'text-red-600' : 'text-yellow-600'}`}>
                      {usage.current_usage}/{usage.limit} leads used on your {usage.tier} plan
                    </p>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant={usage.current_usage >= usage.limit ? "destructive" : "outline"}
                  onClick={() => window.location.href = "/pricing"}
                >
                  {usage.current_usage >= usage.limit ? 'Upgrade Now' : 'Upgrade Plan'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters and Actions */}
        <Card className="mb-6 shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4 items-center w-full">
              <div className="flex flex-wrap gap-4 w-full">
                <div className="relative flex-grow min-w-[220px] max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search leads..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full"
                    data-testid="input-search-leads"
                  />
                </div>
                <div className="flex-grow min-w-[180px] max-w-xs">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full" data-testid="select-status-filter">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="replied">Replied</SelectItem>
                      <SelectItem value="connected">Connected</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-grow min-w-[180px] max-w-xs">
                  <Select value={enrichmentFilter} onValueChange={setEnrichmentFilter}>
                    <SelectTrigger className="w-full" data-testid="select-enrichment-filter">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by enrichment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="enriched">Enriched</SelectItem>
                      <SelectItem value="not_enriched">Not Enriched</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="Filter by company"
                  value={companyFilter}
                  onChange={e => setCompanyFilter(e.target.value)}
                  className="w-48"
                  data-testid="input-company-filter"
                />
                <Input
                  placeholder="Filter by job title"
                  value={jobTitleFilter}
                  onChange={e => setJobTitleFilter(e.target.value)}
                  className="w-48"
                  data-testid="input-jobtitle-filter"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Bulk Actions */}
                {selectedLeads.length > 0 && (
                  <>
                    <Button size="sm" variant="default" onClick={handleBulkEnrich} disabled={bulkEnrichMutation.isPending} data-testid="button-bulk-enrich">
                      {bulkEnrichMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Bulk Enrich"}
                    </Button>
                    <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending} data-testid="button-bulk-delete">
                      {bulkDeleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Bulk Delete"}
                    </Button>
                    <Select onValueChange={handleBulkStatusUpdate}>
                      <SelectTrigger className="w-40" data-testid="select-bulk-status">
                        <SelectValue placeholder="Bulk Update Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Set to Pending</SelectItem>
                        <SelectItem value="contacted">Set to Contacted</SelectItem>
                        <SelectItem value="replied">Set to Replied</SelectItem>
                        <SelectItem value="connected">Set to Connected</SelectItem>
                        <SelectItem value="failed">Set to Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-leads">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
                <a
                  href="/csv-template/leads-template.csv"
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Button size="sm" variant="outline" data-testid="button-download-csv-template">
                    Download Lead Template
                  </Button>
                </a>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setScrapeModalOpen(true)}
                  data-testid="button-scrape-linkedin-leads"
                >
                  <Search className="h-4 w-4 mr-2" />
                  Scrape  Leads
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleUploadClick}
                  data-testid="button-upload-leads"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Leads
                </Button>
                     {/* <Button size="sm" variant="outline" onClick={() => setShowUnassigned(v => !v)} data-testid="button-toggle-unassigned">
                  {showUnassigned ? "Show All Leads" : "Show Unassigned Leads"}
                </Button> */}
                {/* {showUnassigned && (
                  <Button size="sm" variant="default" disabled={selectedLeads.length === 0} onClick={() => setAssignDialogOpen(true)} data-testid="button-assign-campaign">
                    Assign to Campaign
                  </Button>
                )} */}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Batch Filter Buttons */}
        {batches.length > 0 && (
          <Card className="mb-4 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedBatchId === null ? "default" : "outline"}
                  onClick={() => setSelectedBatchId(null)}
                >
                  All Batches
                </Button>
                
                {(showAllBatches ? batches : batches.slice(0, 6)).map((b) => (
                   <div key={b.id} className="flex items-center gap-1">
                  <Button
                        size="sm"
                         variant={selectedBatchId === b.id ? "default" : "outline"}
                        onClick={() => setSelectedBatchId(b.id)}
                         >
                   {b.name}{typeof b.count === "number" ? ` (${b.count})` : ""}
               </Button>
               <Button
               size="sm"
               variant="ghost"
               className="text-red-600 hover:text-red-800"
                onClick={() => deleteBatchMutation.mutate(b.id)}
                >
                 <Trash className="h-4 w-4" />
                 </Button>
                   </div>
                    ))} 
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leads Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle data-testid="text-leads-table-title">Lead Management</CardTitle>
            <CardDescription data-testid="text-leads-table-description">
              {filteredLeads.length} leads found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredLeads.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-users text-muted-foreground text-2xl"></i>
                </div>
                <h3 className="font-medium mb-2" data-testid="text-no-leads-title">No leads found</h3>
                <p className="text-sm text-muted-foreground mb-4" data-testid="text-no-leads-description">
                  {searchTerm || statusFilter !== "all" 
                    ? "Try adjusting your search or filter criteria"
                    : "Upload leads through campaigns to get started"
                  }
                </p>
                <Button data-testid="button-upload-first-leads" onClick={handleUploadClick}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Leads
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                        onChange={handleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead: Lead) => (
                    <TableRow key={lead.id} data-testid={`lead-row-${lead.id}`}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => handleSelectLead(lead.id)}
                          data-testid={`checkbox-lead-${lead.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium" data-testid={`text-lead-name-${lead.id}`}>
                            {lead.first_name} {lead.last_name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <a 
                              href={lead.profile_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:underline"
                              data-testid={`link-lead-profile-${lead.id}`}
                            >
                              View Profile
                            </a>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-lead-company-${lead.id}`}>
                        {lead.company}
                      </TableCell>
                      <TableCell data-testid={`text-lead-title-${lead.id}`}>
                        {lead.job_title}
                      </TableCell>
                      <TableCell>
                        {lead.email ? (
                          <div>
                            <span className="font-mono text-xs">{lead.email}</span>
                            {typeof lead.email_confidence === "number" && (
                              <Badge variant="secondary" className="ml-2">Confidence: {lead.email_confidence}</Badge>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => enrichEmailMutation.mutate(lead.id)}
                              disabled={enrichEmailMutation.isPending}
                              data-testid={`button-enrich-email-${lead.id}`}
                            >
                              {enrichEmailMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Enrich Email"}
                            </Button>
                            {enrichErrors[lead.id] && (
                              <span className="text-xs text-red-600">{enrichErrors[lead.id]}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={lead.status}
                          onValueChange={(value) => handleStatusChange(lead.id, value)}
                        >
                          <SelectTrigger className="w-32" data-testid={`select-lead-status-${lead.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="replied">Replied</SelectItem>
                            <SelectItem value="connected">Connected</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`button-view-lead-${lead.id}`}
                            onClick={() => handleViewHistory(lead.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button> 
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteLead(lead.id)}
                            data-testid={`button-delete-lead-${lead.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {/* Pagination controls */}
        <div className="flex items-center gap-2 mt-4">
          <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(totalLeads / pageSize))}</span>
          <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * pageSize >= totalLeads}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
          <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="w-24 ml-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Upload Leads Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={open => { if (!open) { setUploadDialogOpen(false); setUploadBatchName(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Leads</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Batch Name (required)"
                value={uploadBatchName}
                onChange={e => setUploadBatchName(e.target.value)}
                data-testid="input-batch-name"
              />
              {/* Campaign dropdown removed as per requirements */}
              <div className="text-sm text-muted-foreground">File: {pendingFile?.name}</div>
            </div>
            <DialogFooter className="mt-6">
              <Button onClick={handleUploadLeads} disabled={uploading || !uploadBatchName.trim()}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={uploadRowErrors.length > 0} onOpenChange={open => { if (!open) setUploadRowErrors([]); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Row Errors</DialogTitle>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              {uploadRowErrors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No errors.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left p-2">Row</th>
                      <th className="text-left p-2">Reason</th>
                      <th className="text-left p-2">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadRowErrors.map((err, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2">{err.row}</td>
                        <td className="p-2">{err.reason}</td>
                        <td className="p-2 whitespace-pre-wrap">{JSON.stringify(err.row_data)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Background Task Status */}
        {Object.keys(backgroundTasks).length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Background Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.entries(backgroundTasks).map(([taskId, task]) => (
                <div key={taskId} className="flex items-center gap-2 mb-2">
                  {task.status === "pending" && <Clock className="h-4 w-4 text-yellow-500" />}
                  {task.status === "done" && <CheckCircle className="h-4 w-4 text-green-500" />}
                  {task.status === "error" && <XCircle className="h-4 w-4 text-red-500" />}
                  <span>Task {taskId.slice(0, 8)}: {task.status}</span>
                  {task.result && (
                    <span className="text-sm text-muted-foreground">
                      {task.status === "done" && `Enriched: ${task.result.enriched?.length || 0}, Failed: ${task.result.failed?.length || 0}`}
                      {task.status === "error" && task.result}
                    </span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
      <Dialog open={scrapeModalOpen} onOpenChange={setScrapeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scrape LinkedIn Leads</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); scrapeLeadsMutation.mutate(scrapeForm); }}>
            <div className="space-y-4">
              <Input
                placeholder="Keywords (optional)"
                value={scrapeForm.keywords}
                onChange={e => setScrapeForm(f => ({ ...f, keywords: e.target.value }))}
                data-testid="input-scrape-keywords"
              />
              <Input
                placeholder="Industry (optional)"
                value={scrapeForm.industry}
                onChange={e => setScrapeForm(f => ({ ...f, industry: e.target.value }))}
                data-testid="input-scrape-industry"
              />
              <Input
                placeholder="Location (optional)"
                value={scrapeForm.location}
                onChange={e => setScrapeForm(f => ({ ...f, location: e.target.value }))}
                data-testid="input-scrape-location"
              />
              <Input
                placeholder="Current Company (optional)"
                value={scrapeForm.currentCompany}
                onChange={e => setScrapeForm(f => ({ ...f, currentCompany: e.target.value }))}
                data-testid="input-scrape-company"
              />
              <Input
                placeholder="Job Title (optional)"
                value={scrapeForm.job_title}
                onChange={e => setScrapeForm(f => ({ ...f, job_title: e.target.value }))}
                data-testid="input-scrape-job-title"
              />
            </div>
            <DialogFooter className="mt-6">
              <Button type="submit" disabled={scrapeLeadsMutation.isPending}>
                {scrapeLeadsMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Start Scraping
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Leads to Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaigns?.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssignToCampaign} disabled={!selectedCampaign || assigning}>
              {assigning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : "Assign"}
            </Button>
          </div>
        </DialogContent>
      </Dialog> */}

      {/* Lead History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lead History</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : leadHistory && leadHistory.length > 0 ? (
              <div className="space-y-4">
                {leadHistory.map((entry, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium capitalize">{entry.action}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {entry.field && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Field:</span> {entry.field}
                      </div>
                    )}
                    {entry.old_value && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">From:</span> {entry.old_value}
                      </div>
                    )}
                    {entry.new_value && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">To:</span> {entry.new_value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No history available for this lead.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
