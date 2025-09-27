const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [batch_name, setBatch_name] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({ csvData, batch_name }: { csvData: string; batch_name: string }) => {
      const res = await apiRequest("POST", `${apiUrl}/api/leads/upload`, { csvData, batch_name });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload successful",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/campaigns/stats`] });
      queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/activity`] });
      queryClient.invalidateQueries({ queryKey: [`${apiUrl}/api/usage`] });
      onClose();
      setSelectedFile(null);
      setBatch_name("");
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "text/csv") {
      setSelectedFile(file);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !batch_name.trim()) {
      toast({
        title: "Missing information",
        description: "Please select a file and enter a batch name",
        variant: "destructive",
      });
      return;
    }

    try {
      const csvContent = await selectedFile.text();
      uploadMutation.mutate({ csvData: csvContent, batch_name: batch_name.trim() });
    } catch (error) {
      toast({
        title: "File read error",
        description: "Failed to read the CSV file",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="upload-modal">
        <DialogHeader>
          <DialogTitle data-testid="text-upload-modal-title">Upload Leads</DialogTitle>
          <DialogDescription data-testid="text-upload-modal-description">
            Import leads from a CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="batch-name" data-testid="label-batch-name">Batch Name</Label>
            <Input
              id="batch-name"
              type="text"
              placeholder="Enter batch name"
              value={batch_name}
              onChange={(e) => setBatch_name(e.target.value)}
              data-testid="input-batch-name"
            />
          </div>

          <div>
            <Label htmlFor="csv-file" data-testid="label-csv-file">CSV File</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <i className="fas fa-cloud-upload text-4xl text-muted-foreground mb-4"></i>
              <p className="text-sm font-medium mb-2" data-testid="text-upload-instruction">
                {selectedFile ? selectedFile.name : "Drop your CSV file here"}
              </p>
              <p className="text-xs text-muted-foreground mb-4">or click to browse</p>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-csv-file"
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("csv-file")?.click()}
                data-testid="button-choose-file"
              >
                Choose File
              </Button>
            </div>
            <div className="mt-4 text-xs text-muted-foreground" data-testid="text-csv-format-info">
              <p>Supported format: CSV with columns: first_name, last_name, job_title, company, profile_url</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-upload">
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploadMutation.isPending || !selectedFile || !batch_name.trim()}
            data-testid="button-upload-file"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}