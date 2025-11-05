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
  const [remember, setRemember] = useState(true); // 1 day

  // Apply theme: default to glass on Auth, switch to user preference when available
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

  // Auto-redirect authenticated users away from the sign-in page
  useEffect(() => {
    if (alreadySignedIn) {
      navigate(redirectAfterAuth || "/dashboard");
    }
  }, [alreadySignedIn, navigate, redirectAfterAuth]);

  if (alreadySignedIn) return null;

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const email = (formData.get("email") as string) || "";
      const password = (formData.get("password") as string) || "";

      await signIn(email, password);

      try {
        if (remember) {
          // 1 day in minutes
          localStorage.setItem("sessionTimeoutMin", String(60 * 24));
        } else {
          localStorage.removeItem("sessionTimeoutMin");
        }
      } catch {}

      navigate(redirectAfterAuth || "/dashboard");
    } catch (error) {
      console.error("Login error:", error);
      setError(
        error instanceof Error ? error.message : "Login failed. Check your credentials."
      );
    } finally {
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
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Enter your email (user ID) and password.</CardDescription>
        </CardHeader>

        <form onSubmit={handleLoginSubmit}>
          <CardContent>
            <div className="space-y-3">
              <div className="relative flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    className="pl-9"
                    disabled={isLoading}
                    required
                    autoComplete="username"
                  />
                </div>
                <Button type="submit" variant="outline" size="icon" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <Input
                name="password"
                placeholder="Password"
                type="password"
                disabled={isLoading}
                required
                autoComplete="current-password"
              />

              <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                  aria-label="Remember this device for 1 day"
                />
                Remember this device for 1 day
              </label>
            </div>

            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </CardContent>

          <CardFooter className="flex-col gap-2">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </form>

        <div className="py-4 px-6 text-xs text-center text-muted-foreground bg-muted border-t rounded-b-lg">
          Secured by{" "}
          <a
            href="https://vly.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-primary transition-colors"
          >
            vly.ai
          </a>
        </div>
      </Card>
    </div>
  );
}