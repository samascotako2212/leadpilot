const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function AiMessageGenerator() {
  const [leadInfo, setLeadInfo] = useState("");
  const [tone, setTone] = useState("professional");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const { toast } = useToast();

  const generateMessageMutation = useMutation({
    mutationFn: async ({ leadInfo, tone }: { leadInfo: string; tone: string }) => {
  const res = await apiRequest("POST", `${apiUrl}/generate-message`, { leadInfo, tone });
      return await res.json();
    },
    onSuccess: (data) => {
      setGeneratedMessage(data.message);
      toast({
        title: "Message generated",
        description: "AI-powered message ready for review",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!leadInfo.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter lead information to generate a message",
        variant: "destructive",
      });
      return;
    }
    generateMessageMutation.mutate({ leadInfo, tone });
  };

  return (
    <Card data-testid="ai-message-generator">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2" data-testid="text-ai-generator-title">
          <i className="fas fa-magic text-primary"></i>
          AI Message Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="lead-info" className="text-sm font-medium mb-2 block" data-testid="label-lead-info">
              Lead Information
            </Label>
            <Input
              id="lead-info"
              type="text"
              placeholder="John Doe, CEO at TechCorp"
              value={leadInfo}
              onChange={(e) => setLeadInfo(e.target.value)}
              data-testid="input-lead-info"
            />
          </div>
          <div>
            <Label htmlFor="message-tone" className="text-sm font-medium mb-2 block" data-testid="label-message-tone">
              Message Tone
            </Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger data-testid="select-message-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleGenerate}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={generateMessageMutation.isPending}
            data-testid="button-generate-message"
          >
            {generateMessageMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <i className="fas fa-wand-magic-sparkles mr-2"></i>
                Generate Message
              </>
            )}
          </Button>
          
          {generatedMessage && (
            <div className="mt-4">
              <Label className="text-sm font-medium mb-2 block" data-testid="label-generated-message">
                Generated Message
              </Label>
              <Textarea
                value={generatedMessage}
                onChange={(e) => setGeneratedMessage(e.target.value)}
                className="min-h-20"
                data-testid="textarea-generated-message"
              />
              <div className="flex justify-end mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedMessage);
                    toast({
                      title: "Copied to clipboard",
                      description: "Message copied successfully",
                    });
                  }}
                  data-testid="button-copy-message"
                >
                  <i className="fas fa-copy mr-2"></i>
                  Copy
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
