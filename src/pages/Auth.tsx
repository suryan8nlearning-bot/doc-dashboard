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

import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

export default function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn, user } = useAuth();
  const navigate = useNavigate();
  const alreadySignedIn = !authLoading && isAuthenticated;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn(email, password);

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
      setError(
        err instanceof Error
          ? err.message
          : "Failed to sign in. Please check your credentials."
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border border-white/10 bg-background/60 backdrop-blur-md shadow-md">
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
            Sign in
          </CardTitle>
          <CardDescription>
            Enter your email and password to sign in
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
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

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  placeholder="Password"
                  type="password"
                  disabled={isLoading}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                  aria-label="Remember this device for 1 day"
                />
                Remember this device for 1 day
              </label>

              {error && (
                <p className="mt-2 text-sm text-red-500">{error}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>

        <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
          Secured by{" "}
          <a
            href="https://supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary transition-colors"
          >
            Supabase
          </a>
        </div>
      </Card>
    </div>
  );
}

/*
  DEPRECATED OTP AUTHENTICATION CODE (kept for reference)

  The app previously used email OTP authentication.
  To re-enable OTP, you would need to:
  1. Restore the emailOtp provider in convex/auth.ts
  2. Add back the step state: const [step, setStep] = useState<"signIn" | { email: string }>("signIn")
  3. Implement handleEmailSubmit and handleOtpSubmit functions
  4. Import InputOTP, InputOTPGroup, InputOTPSlot from @/components/ui/input-otp
  5. Restore the OTP verification UI in the return statement

  Previous implementation used:
  - @convex-dev/auth/providers/Email
  - 6-digit OTP tokens
  - 15-minute token expiration
  - Email sending via vly.ai service

  This has been replaced with Supabase email/password authentication.
*/