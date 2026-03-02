import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { AlertCircle, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  /** When true, email/password were accepted and we are waiting for email OTP (two-step verification). */
  const [emailOtpStep, setEmailOtpStep] = useState(false);
  const [emailVerificationOtp, setEmailVerificationOtp] = useState("");
  const { login, verifyEmailOTP, loginWithOTP, requestOTP } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result?.requiresEmailOTP) {
        setEmailOtpStep(true);
        setEmailVerificationOtp("");
        toast({
          title: "Code sent to administrator",
          description: "Get the 6-digit code from your admin and enter it below to complete sign in.",
        });
        return;
      }
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

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await verifyEmailOTP(email, password, emailVerificationOtp);
      toast({
        title: "Welcome back!",
        description: "You have been successfully logged in.",
      });
    } catch (err: any) {
      setError(err.message || "Invalid or expired code. Please try again.");
      toast({
        title: "Verification failed",
        description: err.message || "Invalid or expired code. Please try again.",
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
              <Logo size="lg" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                myBiniyog Valora
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
                {emailOtpStep ? (
                  <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      A verification code was sent to your administrator. Get the 6-digit code from them and enter it below to complete sign in.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="email-verification-otp" className="text-sm font-medium">Verification code</Label>
                      <Input
                        id="email-verification-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        maxLength={6}
                        value={emailVerificationOtp}
                        onChange={(e) => setEmailVerificationOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        className="h-11 text-center tracking-widest text-lg"
                        data-testid="input-email-verification-otp"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-medium shadow-lg"
                      data-testid="button-verify-email-otp"
                      disabled={loading || emailVerificationOtp.length !== 6}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify and sign in"
                      )}
                    </Button>
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        disabled={loading}
                        onClick={async () => {
                          setError("");
                          setLoading(true);
                          try {
                            await login(email, password);
                            setEmailVerificationOtp("");
                            toast({ title: "New code sent", description: "A new code was sent to your administrator." });
                          } catch (err: any) {
                            setError(err.message || "Failed to resend code.");
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        Resend code
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={loading}
                        onClick={() => {
                          setEmailOtpStep(false);
                          setEmailVerificationOtp("");
                          setError("");
                        }}
                      >
                        Back to email & password
                      </Button>
                    </div>
                  </form>
                ) : (
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
                )}
                <div className="text-center space-y-2">
                  <div className="text-sm text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setLocation("/forgot-password")}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
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
