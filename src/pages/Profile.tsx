import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/convex/_generated/api';
import { useMutation } from 'convex/react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Save, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

export default function Profile() {
  const { isLoading: authLoading, isAuthenticated, user, signOut } = useAuth();
  const navigate = useNavigate();
  const updateUser = useMutation(api.users.updateProfile);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [theme, setTheme] = useState('modern');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) {
      setName('');
      setEmail(user.email || '');
      setTheme(user.theme || 'modern');

      applyTheme(user.theme || 'modern');
    }
  }, [user]);

  const applyTheme = (selectedTheme: string) => {
    const root = document.documentElement;
    // Remove all theme classes first
    root.classList.remove('dark', 'glass-theme');
    
    // Apply the selected theme
    if (selectedTheme === 'glass') {
      root.classList.add('glass-theme');
    } else if (selectedTheme === 'dark') {
      root.classList.add('dark');
    }
    // 'modern' is the default, no class needed
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateUser({ name, theme });
      
      // Apply theme immediately
      applyTheme(theme);
      
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="Logo"
              className="h-8 w-8 cursor-pointer"
              loading="lazy"
              decoding="async"
              onClick={() => navigate('/')}
            />
            <h1 className="text-xl font-bold tracking-tight">User Profile</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-2xl"
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <CardTitle>Profile Settings</CardTitle>
                  <CardDescription>Manage your account information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    disabled={isSaving}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email cannot be changed
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <select
                    id="theme"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    disabled={isSaving}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="modern">Modern Minimalist</option>
                    <option value="glass">Glass Morphism</option>
                    <option value="dark">Dark Mode</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Choose your preferred theme style
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <div className="px-3 py-2 bg-muted rounded-md text-sm">
                    User
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">User Account</div>
                      <div className="text-muted-foreground text-xs">{user?.email}</div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleSignOut}
                    disabled={isSaving}
                  >
                    Sign Out
                  </Button>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={isSaving} className="w-full">
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}