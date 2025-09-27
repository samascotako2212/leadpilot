import { useState, useEffect } from "react";
import { LeadPilotLogo } from "@/components/ui/LeadPilotLogo";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";


export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [registerData, setRegisterData] = useState({ email: "", password: "", subscriptionTier: "free" });
  const navigate = useNavigate();


  // Redirect if already authenticated (moved to useEffect for reliability)
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { email: loginData.email, password: loginData.password },
      {
        onSuccess: () => {
          navigate("/");
        },
      }
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(
      { email: registerData.email, password: registerData.password },
      {
        onSuccess: () => {
          navigate("/auth");
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
      {/* Left Column - Auth Forms */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8 bg-background">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="flex items-center justify-center mb-4">
              <LeadPilotLogo size={40} />
            </div>
            <p className="text-muted-foreground">
              Automate your LinkedIn outreach with AI-powered personalization
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2" data-testid="auth-tabs">
              <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="tab-register">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle data-testid="text-login-title">Welcome back</CardTitle>
                  <CardDescription data-testid="text-login-description">
                    Enter your credentials to access your dashboard
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email" data-testid="label-login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        value={loginData.email}
                        onChange={(e) => setLoginData(prev => ({ ...prev, email: e.target.value }))}
                        required
                        data-testid="input-login-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password" data-testid="label-login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        value={loginData.password}
                        onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                        required
                        data-testid="input-login-password"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={loginMutation.isPending}
                      data-testid="button-login-submit"
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Logging in...
                        </>
                      ) : (
                        "Log In"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="register">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle data-testid="text-register-title">Create an account</CardTitle>
                  <CardDescription data-testid="text-register-description">
                    Start automating your LinkedIn outreach today
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-email" data-testid="label-register-email">Email</Label>
                      <Input
                        id="register-email"
                        type="email"
                        value={registerData.email}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                        required
                        data-testid="input-register-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password" data-testid="label-register-password">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        value={registerData.password}
                        onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                        required
                        data-testid="input-register-password"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={registerMutation.isPending}
                      data-testid="button-register-submit"
                    >
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        
      </div>
      </div>

      {/* Right Column - Hero Section */}
      <div className="hidden md:flex flex-1 items-center justify-center p-4 md:p-8 bg-muted">
        <div className="text-center max-w-md">
          <div className="mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LeadPilotLogo size={64} />
            </div>
            <h2 className="text-3xl font-bold mb-4" data-testid="text-hero-title">
              Scale Your LinkedIn Outreach
            </h2>
            <p className="text-muted-foreground text-lg" data-testid="text-hero-description">
              Generate personalized messages, track responses, and grow your network with AI-powered automation.
            </p>
          </div>
          <div className="space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-chart-2 rounded-lg flex items-center justify-center">
                <i className="fas fa-robot text-white text-sm"></i>
              </div>
              <span className="font-medium">AI-powered message personalization</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-chart-1 rounded-lg flex items-center justify-center">
                <i className="fas fa-chart-bar text-white text-sm"></i>
              </div>
              <span className="font-medium">Real-time campaign analytics</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-chart-4 rounded-lg flex items-center justify-center">
                <i className="fas fa-users text-white text-sm"></i>
              </div>
              <span className="font-medium">Lead management & tracking</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
