import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuthActions } from "@convex-dev/auth/react";

interface AuthProps {
  redirectAfterAuth?: string;
}

export default function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const alreadySignedIn = !authLoading && isAuthenticated;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");

  useEffect(() => {
    const root = document.documentElement;
    const apply = (theme?: string) => {
      root.classList.remove("dark", "glass-theme");
      if (theme === "dark") {
        root.classList.add("dark");
      } else if (theme === "glass") {
        root.classList.add("glass-theme");
      } else {
        root.classList.add("glass-theme");
      }
    };

    if (isAuthenticated) {
      apply(user?.theme as string | undefined);
    } else {
      apply("glass");
    }
  }, [isAuthenticated, user?.theme]);

  useEffect(() => {
    if (alreadySignedIn) {
      navigate(redirectAfterAuth || "/dashboard");
    }
  }, [alreadySignedIn, navigate, redirectAfterAuth]);

  if (alreadySignedIn) {
    return null;
  }

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", { email });
      setStep({ email });
    } catch (err) {
      console.error("Authentication error:", err);
      setError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", { email: typeof step === "object" ? step.email : "", code });

      try {
        if (remember) {
          localStorage.setItem("sessionTimeoutMin", String(60 * 24));
        } else {
          localStorage.removeItem("sessionTimeoutMin");
        }
      } catch {}

      const redirect = redirectAfterAuth || "/dashboard";
      navigate(redirect);
    } catch (err) {
      console.error("Authentication error:", err);
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-6 overflow-hidden">
      <div className="pointer-events-none absolute -z-10 top-[-10%] left-[-10%] h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -z-10 bottom-[-10%] right-[-10%] h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      <Card className="w-full max-w-md border border-white/20 bg-background/50 backdrop-blur-xl shadow-xl shadow-black/10 rounded-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center">
            <img
              src="/logo.svg"
              alt="Logo"
              width={64}
              height={64}
              className="rounded-lg mb-4 mt-4 cursor-pointer"
              onClick={() => navigate("/")}
            />
          </div>
          <CardTitle className="text-xl">
            {step === "signIn" ? "Sign in" : "Enter verification code"}
          </CardTitle>
          <CardDescription>
            {step === "signIn"
              ? "Enter your email to receive a verification code"
              : `We sent a code to ${typeof step === "object" ? step.email : ""}`}
          </CardDescription>
        </CardHeader>

        {step === "signIn" ? (
          <form onSubmit={handleEmailSubmit}>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      placeholder="name@example.com"
                      type="email"
                      className="pl-9"
                      disabled={isLoading}
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 text-base text-muted-foreground select-none">
                  <Checkbox
                    size="xl"
                    variant="glass"
                    className="rounded-md"
                    checked={remember}
                    onCheckedChange={(v) => setRemember(Boolean(v))}
                    aria-label="Remember this device for 1 day"
                    disabled={isLoading}
                  />
                  Remember this device for 1 day
                </label>

                {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        ) : (
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verification Code</Label>
                <InputOTP
                  maxLength={6}
                  disabled={isLoading}
                  onComplete={handleOtpSubmit}
                  autoFocus
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("signIn")}
                disabled={isLoading}
                className="w-full"
              >
                Use a different email
              </Button>
            </div>
          </CardContent>
        )}

        <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
          Secured by Convex Auth
        </div>
      </Card>
    </div>
  );
}