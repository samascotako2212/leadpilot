import { Sidebar } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Crown, Zap, Building } from "lucide-react";
import { apiRequest } from "@/lib/queryClient"
interface Plan {
  name: string;
  price: number;
  currency: string;
  leads_limit: number;
  description: string;
}
const apiUrl = import.meta.env.VITE_API_URL;
import { useLocation } from "wouter";

export default function Pricing() {
  const { toast } = useToast();
  const [location] = useLocation();
  useEffect(() => {
    if (location.includes("success=true")) {
      toast({
        title: "Payment Successful",
        description: "Your subscription is now active!",
        variant: "default",
      });
    } else if (location.includes("cancel=true")) {
      toast({
        title: "Payment Cancelled",
        description: "Your payment was cancelled. Please try again.",
        variant: "destructive",
      });
    }
  }, [location, toast]);
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  const { data: plans } = useQuery<Plan[]>({
    queryKey: [`${apiUrl}/api/subscriptions/plans`],
  });

  const { data: currentSubscription } = useQuery({
    queryKey: [`${apiUrl}/api/subscriptions/current`],
  });

  const { data: usage } = useQuery({
    queryKey: [`${apiUrl}/api/subscriptions/usage`],
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (planTier: string) => {
  const res = await apiRequest("POST", `${apiUrl}/subscriptions/create-payment`, { plan_tier: planTier });
      return await res.json();
    },
    onSuccess: (data) => {
      // Redirect to Stripe checkout page
      window.location.href = data.checkout_url;
    },
    onError: (error: Error) => {
      toast({
        title: "Payment Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleUpgrade = async (planTier: string) => {
    setLoading(planTier);
    try {
      await createPaymentMutation.mutateAsync(planTier);
    } finally {
      setLoading(null);
    }
  };

  const getPlanIcon = (planName: string) => {
    switch (planName.toLowerCase()) {
      case "free":
        return <Zap className="h-6 w-6" />;
      case "pro":
        return <Crown className="h-6 w-6" />;
      case "enterprise":
        return <Building className="h-6 w-6" />;
      default:
        return <Zap className="h-6 w-6" />;
    }
  };

  const getPlanColor = (planName: string) => {
    switch (planName.toLowerCase()) {
      case "free":
        return "border-gray-200";
      case "pro":
        return "border-blue-500 ring-2 ring-blue-100";
      case "enterprise":
        return "border-purple-500 ring-2 ring-purple-100";
      default:
        return "border-gray-200";
    }
  };

  return (
      <div className="dashboard-grid">
        <Sidebar />
        <main className="p-6">
          <header className="mb-8">
            <h1 className="text-2xl font-bold mb-2">Pricing Plans</h1>
            <p className="text-gray-600">Choose the perfect plan for your lead generation needs</p>
          </header>

          {/* Current Usage */}
          {usage && typeof usage === "object" && "current_usage" in usage && "limit" in usage && "tier" in usage && (
            (() => {
              const u = usage as { current_usage: number; limit: number; tier: string };
              const percent = Math.min(100, (u.current_usage / u.limit) * 100);
              let barColor = "bg-green-500";
              if (percent >= 80 && percent < 100) barColor = "bg-yellow-500";
              if (percent >= 100) barColor = "bg-red-500";
              return (
                <div className="bg-white rounded-lg shadow p-6 mb-8">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold mb-2">Current Usage</h2>
                    <p className={`text-sm ${u.current_usage > u.limit ? 'text-red-700 font-bold' : 'text-gray-500'}`}>
                      {u.current_usage} / {u.limit} leads used
                      {u.current_usage > u.limit && <span className="ml-2 text-red-600 font-bold">Over Limit</span>}
                    </p>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className={`${barColor} h-2 rounded-full`}
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-medium text-blue-600 mt-2 inline-block">{u.tier.toUpperCase()}</span>
                    {u.current_usage > u.limit && (
                      <div className="mt-2 text-xs text-red-700 font-semibold">You have exceeded your monthly credit limit!</div>
                    )}
                  </div>
                </div>
              );
            })()
          )}

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {plans?.map((plan) => {
              const isCurrentPlan = currentSubscription && typeof currentSubscription === "object" && "tier" in currentSubscription
                ? currentSubscription.tier === plan.name.toLowerCase()
                : false;
              const isPopular = plan.name.toLowerCase() === "pro";
              return (
                <div className={`bg-white rounded-lg shadow p-6 relative flex flex-col ${isPopular ? 'border-2 border-blue-600 scale-105' : ''}`} key={plan.name}>
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-semibold z-10">Most Popular</span>
                  )}
                  <div className="flex flex-col items-center mb-4">
                    <h2 className="text-xl font-bold mb-1">{plan.name}</h2>
                    <div className="text-3xl font-bold mb-2">
                      ₦{plan.price.toLocaleString()}
                      {plan.price > 0 && <span className="text-sm text-gray-500">/month</span>}
                    </div>
                    <p className="text-gray-600 mb-2 text-center">{plan.description}</p>
                  </div>
                  <ul className="mb-6 space-y-2 w-full">
                    <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" />{plan.leads_limit.toLocaleString()} leads per month</li>
                    <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" />LinkedIn automation</li>
                    <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" />Email campaigns</li>
                    <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" />Lead management</li>
                    <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" />Analytics & reporting</li>
                    {plan.name.toLowerCase() !== "free" && (
                      <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" />Priority support</li>
                    )}
                  </ul>
                  <button
                    className={`w-full py-2 px-4 rounded font-semibold transition flex items-center justify-center mt-auto ${isCurrentPlan ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : isPopular ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white border border-gray-300 text-blue-600 hover:bg-blue-50'}`}
                    disabled={isCurrentPlan || loading === plan.name.toLowerCase()}
                    onClick={() => handleUpgrade(plan.name.toLowerCase())}
                  >
                    {loading === plan.name.toLowerCase() ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : isCurrentPlan ? (
                      "Current Plan"
                    ) : plan.price === 0 ? (
                      "Get Started"
                    ) : (
                      "Upgrade Now"
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Plan Comparison Table */}
          <div className="bg-white rounded-lg shadow p-6 mt-12 overflow-x-auto">
            <h2 className="text-lg font-bold mb-4">Compare Plans</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border">
                <thead>
                  <tr>
                    <th className="p-2 border">Feature</th>
                    {plans?.map(plan => (
                      <th key={plan.name} className="p-2 border">{plan.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border">Leads per month</td>
                    {plans?.map(plan => (
                      <td key={plan.name} className="p-2 border">{plan.leads_limit.toLocaleString()}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-2 border">LinkedIn automation</td>
                    {plans?.map(() => <td className="p-2 border text-green-600">✔</td>)}
                  </tr>
                  <tr>
                    <td className="p-2 border">Email campaigns</td>
                    {plans?.map(() => <td className="p-2 border text-green-600">✔</td>)}
                  </tr>
                  <tr>
                    <td className="p-2 border">Lead management</td>
                    {plans?.map(() => <td className="p-2 border text-green-600">✔</td>)}
                  </tr>
                  <tr>
                    <td className="p-2 border">Analytics & reporting</td>
                    {plans?.map(() => <td className="p-2 border text-green-600">✔</td>)}
                  </tr>
                  <tr>
                    <td className="p-2 border">Priority support</td>
                    {plans?.map(plan => (
                      <td key={plan.name} className="p-2 border text-green-600">{plan.name.toLowerCase() !== "free" ? "✔" : "-"}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
  );
}
