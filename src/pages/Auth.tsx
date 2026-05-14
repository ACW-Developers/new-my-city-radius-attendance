import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, EyeOff, Fingerprint, CheckCircle2, AlertCircle, ArrowRight, Square } from 'lucide-react';
import logo from '@/assets/my_city_logo.png';
import bgImage from '@/assets/bg7.jpg';

const Auth = () => {
  const { session, loading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-primary text-sm">Loading...</div>
      </div>
    );
  }

  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden lg:flex lg:w-1/2 overflow-hidden">
        <img src={bgImage} alt="Office Building" className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative z-10 flex flex-col justify-end p-10 w-full">
          <div className="inline-block self-start rounded-xl bg-background/70 backdrop-blur-sm px-5 py-4 border border-border/40 shadow-lg">
            <h2 className="text-3xl font-bold text-foreground">My City Radius</h2>
            <p className="text-sm text-foreground/80 mt-2 max-w-md">
              Employee attendance tracking with biometric verification, real-time monitoring, and payroll integration.
            </p>
          </div>
          <LiveArizonaClock />
        </div>
      </div>

      <div className="flex w-full items-center justify-center bg-background p-4 sm:p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-5">
          <div className="flex flex-col items-center gap-2">
            <img src={logo} alt="My City Radius" className="h-12 w-auto" />
            <h1 className="text-lg font-bold text-foreground">My City Radius</h1>
            <p className="text-xs text-muted-foreground">Sign in to manage your workspace</p>
          </div>

          <Card className="border-border/50 shadow-md">
            <Tabs defaultValue="login">
              <CardHeader className="pb-2 px-4 pt-4">
                <TabsList className="grid w-full grid-cols-3 h-8">
                  <TabsTrigger value="login" className="text-xs">Sign In</TabsTrigger>
                  <TabsTrigger value="signup" className="text-xs">Sign Up</TabsTrigger>
                  <TabsTrigger value="fingerprint" className="text-xs gap-1"><Fingerprint className="size-3" /> Attend</TabsTrigger>
                </TabsList>
              </CardHeader>

              <TabsContent value="login">
                <LoginForm isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />
              </TabsContent>
              <TabsContent value="signup">
                <SignupForm isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} />
              </TabsContent>
              <TabsContent value="fingerprint">
                <FingerprintAttendancePanel />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
};

function LiveArizonaClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString('en-US', { timeZone: 'America/Phoenix', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const date = now.toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <div className="mt-4 inline-block self-start rounded-xl bg-background/70 backdrop-blur-sm px-5 py-3 border border-border/40 shadow-lg">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Phoenix, Arizona</p>
      <p className="text-2xl font-mono font-bold text-foreground tabular-nums">{time}</p>
      <p className="text-xs text-foreground/80">{date}</p>
    </div>
  );
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

type CheckoutPrompt = { record_id: string; employee: string; check_in: string };

function FingerprintAttendancePanel() {
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<{ action: string; employee: string; worked_minutes?: number } | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const [checkoutPrompt, setCheckoutPrompt] = useState<CheckoutPrompt | null>(null);

  const handleFingerprintAttendance = async () => {
    setProcessing(true);
    setNotRegistered(false);

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: 'required',
          timeout: 60000,
          rpId: window.location.hostname,
        },
      }) as PublicKeyCredential | null;

      if (!assertion) {
        setProcessing(false);
        return;
      }

      const credentialId = bufferToBase64(assertion.rawId);

      const { data: result, error } = await supabase.functions.invoke('qr-attendance', {
        body: { credential_id: credentialId },
      });

      if (error || result?.error) {
        if (result?.error === 'Fingerprint not registered') {
          setNotRegistered(true);
        } else {
          toast.error(result?.error || 'Attendance failed');
        }
        setProcessing(false);
        return;
      }

      if (result.action === 'checked_in') {
        setLastResult(result);
        toast.success(`${result.employee} checked in! ✅`);
      } else if (result.action === 'prompt_checkout') {
        // Show confirmation dialog instead of auto-checkout
        setCheckoutPrompt({ record_id: result.record_id, employee: result.employee, check_in: result.check_in });
      } else if (result.action === 'already_completed') {
        toast.info(`${result.employee} has already completed their shift today`);
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        // User cancelled - do nothing
      } else if (err.name === 'SecurityError' || err.message?.includes('discoverable')) {
        setNotRegistered(true);
      } else {
        toast.error(err.message || 'Fingerprint verification failed');
      }
    }

    setProcessing(false);
  };

  const confirmCheckout = async () => {
    if (!checkoutPrompt) return;
    setProcessing(true);
    const { data: result, error } = await supabase.functions.invoke('qr-attendance', {
      body: { action: 'confirm_checkout', record_id: checkoutPrompt.record_id },
    });
    setProcessing(false);
    if (error || result?.error) {
      toast.error(result?.error || 'Failed to check out');
      return;
    }
    setCheckoutPrompt(null);
    setLastResult(result);
    toast.success(`${result.employee} checked out! 🌟`);
  };

  const formatWorkedTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  };

  const elapsedSinceCheckIn = (iso: string) => {
    const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
    return formatWorkedTime(mins);
  };

  return (
    <CardContent className="px-4 pb-4">
      {lastResult ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-8 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">{lastResult.employee}</p>
          <p className="text-xs text-muted-foreground">
            {lastResult.action === 'checked_in' ? 'Successfully checked in' : `Checked out - ${formatWorkedTime(lastResult.worked_minutes || 0)}`}
          </p>
          <Button onClick={() => { setLastResult(null); setNotRegistered(false); }} variant="outline" size="sm" className="text-xs mt-2">
            Next Employee
          </Button>
        </div>
      ) : notRegistered ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-8 text-destructive" />
          </div>
          <p className="text-xs font-medium text-foreground">Fingerprint Not Registered</p>
          <p className="text-2xs text-muted-foreground text-center">
            Please sign in and register your fingerprint in your Profile page first.
          </p>
          <Button onClick={() => setNotRegistered(false)} variant="outline" size="sm" className="text-xs mt-2">
            Try Again
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            onClick={handleFingerprintAttendance}
            disabled={processing}
            className="group flex size-24 items-center justify-center rounded-full bg-primary/10 hover:bg-primary/20 transition-all duration-300 active:scale-95 disabled:opacity-50"
          >
            <Fingerprint className={`size-12 text-primary transition-transform duration-300 group-hover:scale-110 ${processing ? 'animate-pulse' : ''}`} />
          </button>
          <p className="text-sm font-medium text-foreground">{processing ? 'Verifying...' : 'Tap to Sign In'}</p>
          <p className="text-2xs text-muted-foreground text-center max-w-[220px]">
            Place your finger on the sensor to check in or out - no login needed
          </p>
        </div>
      )}

      {/* Checkout confirmation dialog */}
      <Dialog open={!!checkoutPrompt} onOpenChange={(open) => { if (!open) setCheckoutPrompt(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Square className="size-4 text-destructive" /> Confirm Check Out
            </DialogTitle>
            <DialogDescription className="text-xs">
              Fingerprint verified for {checkoutPrompt?.employee}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <Square className="size-7 text-destructive" />
            </div>
            <p className="text-xs text-center text-foreground">
              End shift for {checkoutPrompt?.employee}?
            </p>
            {checkoutPrompt && (
              <p className="text-2xs text-muted-foreground">
                On shift for {elapsedSinceCheckIn(checkoutPrompt.check_in)}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCheckoutPrompt(null)} disabled={processing}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="text-xs gap-1.5" onClick={confirmCheckout} disabled={processing}>
              <ArrowRight className="size-3" /> {processing ? 'Ending...' : 'Confirm Check Out'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent>
  );
}

function PasswordInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder || '••••••••'}
        value={value}
        onChange={onChange}
        required
        className="pr-10 h-8 text-xs"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  );
}

function LoginForm({ isSubmitting, setIsSubmitting }: { isSubmitting: boolean; setIsSubmitting: (v: boolean) => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);
    if (error) toast.error(error.message);
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email" className="text-xs">Email</Label>
          <Input id="login-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password" className="text-xs">Password</Label>
          <PasswordInput id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full h-8 text-xs" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </CardContent>
    </form>
  );
}

function SignupForm({ isSubmitting, setIsSubmitting }: { isSubmitting: boolean; setIsSubmitting: (v: boolean) => void }) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setIsSubmitting(true);
    const { error } = await signUp(email, password, fullName);
    setIsSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Account created! You can now sign in.');
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardContent className="space-y-3 px-4 pb-4">
        <div className="space-y-1.5">
          <Label htmlFor="signup-name" className="text-xs">Full Name</Label>
          <Input id="signup-name" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-email" className="text-xs">Email</Label>
          <Input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="signup-password" className="text-xs">Password</Label>
          <PasswordInput id="signup-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full h-8 text-xs" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </Button>
        <CardDescription className="text-center text-2xs">
          First user to sign up becomes the admin
        </CardDescription>
      </CardContent>
    </form>
  );
}

export default Auth;
