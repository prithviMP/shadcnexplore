import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { TrendingUp, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState("");
  const { login, register, loginWithOTP, requestOTP } = useAuth();
  const { toast } = useToast();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
      toast({
        title: "Login failed",
        description: err.message || "Please check your credentials.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await requestOTP(otpEmail);
      setOtpSent(true);
      toast({
        title: "OTP sent",
        description: "Please check your email for the verification code.",
      });
    } catch (err: any) {
      setError(err.message || "Failed to send OTP. Please try again.");
      toast({
        title: "Failed to send OTP",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginWithOTP(otpEmail, otp);
      toast({
        title: "Welcome!",
        description: "You have been successfully logged in.",
      });
    } catch (err: any) {
      setError(err.message || "Invalid OTP. Please try again.");
      toast({
        title: "OTP verification failed",
        description: err.message || "Invalid OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-800/50 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
      
      <div className="relative z-10 w-full max-w-md p-4">
        <div className="backdrop-blur-sm bg-white/80 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-8">
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                <TrendingUp className="h-9 w-9 text-white" />
              </div>
            </div>
            <div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                FinAnalytics
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                Professional Financial Screening Platform
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="email" data-testid="tab-email-login">Email</TabsTrigger>
                <TabsTrigger value="otp" data-testid="tab-otp-login">Email OTP</TabsTrigger>
              </TabsList>
              <TabsContent value="email" className="space-y-4">
                {!isSignup ? (
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-11"
                      data-testid="input-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-11"
                      data-testid="input-password"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg" 
                    data-testid="button-email-login"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    setError("");
                    setLoading(true);
                    try {
                      await register(email, password, name, "viewer");
                      toast({
                        title: "Account created!",
                        description: "You have been successfully registered.",
                      });
                    } catch (err: any) {
                      setError(err.message || "Registration failed. Please try again.");
                      toast({
                        title: "Registration failed",
                        description: err.message || "Please try again.",
                        variant: "destructive",
                      });
                    } finally {
                      setLoading(false);
                    }
                  }} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name" className="text-sm font-medium">Full Name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="John Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email" className="text-sm font-medium">Email Address</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-11"
                        required
                        minLength={6}
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg" 
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                  </Button>
                </form>
                )}
                <div className="text-center space-y-2">
                  {!isSignup ? (
                    <>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Forgot password?
                  </a>
                      <div className="text-sm text-muted-foreground">
                        Don't have an account?{" "}
                        <button
                          type="button"
                          onClick={() => setIsSignup(true)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          Sign up
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => setIsSignup(false)}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        Sign in
                      </button>
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="otp" className="space-y-4">
                {!otpSent ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="otp-email" className="text-sm font-medium">Email Address</Label>
                      <Input
                        id="otp-email"
                        type="email"
                        placeholder="you@company.com"
                        value={otpEmail}
                        onChange={(e) => setOtpEmail(e.target.value)}
                        className="h-11"
                        data-testid="input-otp-email"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        We'll send a 6-digit verification code to your email
                      </p>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg" 
                      data-testid="button-request-otp"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send Verification Code"
                      )}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="otp" className="text-sm font-medium">Verification Code</Label>
                      <Input
                        id="otp"
                        type="text"
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        maxLength={6}
                        className="h-11 text-center text-2xl tracking-widest font-mono"
                        data-testid="input-otp"
                      />
                      <p className="text-xs text-muted-foreground text-center">
                        Code sent to {otpEmail}
                      </p>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg" 
                      data-testid="button-verify-otp"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify & Continue"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => setOtpSent(false)}
                      data-testid="button-back"
                    >
                      ← Back
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </div>
      </div>
    </div>
  );
}
