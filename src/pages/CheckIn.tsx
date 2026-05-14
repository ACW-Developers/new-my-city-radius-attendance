import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Play, Pause, Square, Clock, User, CalendarDays, Coffee, Timer,
  CheckCircle2, Sun, Moon as MoonIcon, ScanLine,
  ArrowRight, Zap, Activity, Camera, Fingerprint,
} from 'lucide-react';
import { getTodayDateStringAZ, getCurrentHourAZ, formatTimeAZ, formatDateAZ } from '@/lib/timezone';
import { QRScanner } from '@/components/QRScanner';
import { useWebAuthn } from '@/hooks/useWebAuthn';
import { verifyAttendanceLocation } from '@/lib/geofence';

const BIWEEKLY_TARGET_HOURS = 80;
const PAUSE_REASONS = ['Lunch Break', 'Appointment', 'Personal Break', 'Meeting', 'Other'];

const CheckIn = () => {
  const { user, profile, isAdmin } = useAuth();
  const [record, setRecord] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const [periodHours, setPeriodHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { authenticate, loading: bioLoading } = useWebAuthn();

  // Pause reason dialog
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  // Admin QR continuous scanning
  const [adminScannerActive, setAdminScannerActive] = useState(false);
  const [scanResults, setScanResults] = useState<Array<{ name: string; action: string; time: string }>>([]);
  const [adminCheckoutOpen, setAdminCheckoutOpen] = useState(false);
  const [adminCheckoutPending, setAdminCheckoutPending] = useState<{ record: any; name: string; timeStr: string } | null>(null);

  const today = getTodayDateStringAZ();
  const hour = getCurrentHourAZ();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetingIcon = hour < 17 ? <Sun className="size-4 text-warning" /> : <MoonIcon className="size-4 text-primary" />;

  const fetchToday = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();
    setRecord(data);

    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    while (startOfYear.getDay() !== 1) startOfYear.setDate(startOfYear.getDate() + 1);
    const daysSinceStart = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    const periodIndex = Math.floor(daysSinceStart / 14);
    const periodStart = new Date(startOfYear);
    periodStart.setDate(periodStart.getDate() + periodIndex * 14);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 13);

    const { data: records } = await supabase
      .from('attendance_records')
      .select('total_worked_minutes')
      .eq('user_id', user.id)
      .gte('date', periodStart.toISOString().split('T')[0])
      .lte('date', periodEnd.toISOString().split('T')[0]);

    if (records) {
      setPeriodHours(records.reduce((sum: number, r: any) => sum + Number(r.total_worked_minutes || 0), 0) / 60);
    }
    setLoading(false);
  };

  useEffect(() => { fetchToday(); }, [user]);

  const calculateWorked = (rec: any): number => {
    if (!rec?.check_in) return 0;
    const checkIn = new Date(rec.check_in).getTime();
    const now = rec.status === 'checked_out' && rec.check_out
      ? new Date(rec.check_out).getTime()
      : Date.now();
    let pausedMs = 0;
    const pauses = Array.isArray(rec.pauses) ? rec.pauses : [];
    for (const p of pauses) {
      const start = new Date(p.start).getTime();
      const end = p.end ? new Date(p.end).getTime() : Date.now();
      pausedMs += end - start;
    }
    return Math.max(0, Math.floor((now - checkIn - pausedMs) / 1000));
  };

  useEffect(() => {
    if (record && (record.status === 'checked_in' || record.status === 'paused')) {
      const tick = () => setElapsed(calculateWorked(record));
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    } else if (record) {
      setElapsed(calculateWorked(record));
    }
  }, [record]);

  useEffect(() => {
    if (!record || record.status === 'checked_out') return;
    const check = () => { if (getCurrentHourAZ() >= 17) autoCheckOut(); };
    const interval = setInterval(check, 60000);
    check();
    return () => clearInterval(interval);
  }, [record]);

  const autoCheckOut = async () => {
    if (!record || record.status === 'checked_out') return;
    const pauses = Array.isArray(record.pauses) ? [...record.pauses] : [];
    if (pauses.length > 0 && !pauses[pauses.length - 1].end) {
      pauses[pauses.length - 1].end = new Date().toISOString();
    }
    const workedMinutes = calculateWorked({ ...record, pauses, check_out: new Date().toISOString(), status: 'checked_out' }) / 60;
    await supabase.from('attendance_records')
      .update({ check_out: new Date().toISOString(), status: 'checked_out', pauses, total_worked_minutes: workedMinutes })
      .eq('id', record.id);
    if (user) await supabase.from('activity_logs').insert({ user_id: user.id, action: 'auto_checkout', details: 'Automatically checked out at 5:00 PM Arizona time' });
    toast.info('Your timer was automatically stopped at 5:00 PM');
    fetchToday();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const logActivity = async (action: string, details?: string, userId?: string) => {
    const uid = userId || user?.id;
    if (!uid) return;
    await supabase.from('activity_logs').insert({ user_id: uid, action, details });
  };

  const performCheckIn = async (method: string, targetUserId?: string) => {
    const uid = targetUserId || user?.id;
    if (!uid) return;
    // Geofence: enforce on-site for personal check-ins (admin scanning of others is gated separately)
    if (!targetUserId) {
      const ok = await verifyAttendanceLocation();
      if (!ok) return false;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from('attendance_records').insert({
      user_id: uid, date: today, check_in: now, status: 'checked_in', pauses: [],
    });
    if (error) { toast.error('Already checked in today or error occurred'); return false; }
    if (!targetUserId) {
      toast.success('Welcome to work! Have a productive day! 🎉');
      await logActivity('check_in', `Checked in via ${method} at ${formatTimeAZ(new Date())}`);
      fetchToday();
    } else {
      await logActivity('check_in', `Checked in via admin QR scan at ${formatTimeAZ(new Date())}`, targetUserId);
    }
    return true;
  };

  const handleCheckIn = () => performCheckIn('manual');

  const handleFingerprintCheckIn = async () => {
    if (!user) return;
    const verified = await authenticate(user.id);
    if (verified) await performCheckIn('fingerprint');
  };

  // Checkout confirmation dialog
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutMethod, setCheckoutMethod] = useState<'manual' | 'fingerprint'>('manual');

  const requestCheckout = async (method: 'manual' | 'fingerprint') => {
    const ok = await verifyAttendanceLocation();
    if (!ok) return;
    setCheckoutMethod(method);
    setCheckoutOpen(true);
  };

  const confirmCheckout = async () => {
    setCheckoutOpen(false);
    if (checkoutMethod === 'fingerprint') {
      if (!user) return;
      const verified = await authenticate(user.id);
      if (verified) await handleCheckOut();
    } else {
      await handleCheckOut();
    }
  };

  // Admin continuous QR scanning — uses edge function so session keeps working even if admin logs out
  const handleAdminQRScan = async (data: string) => {
    if (!data.startsWith('MCR:')) { toast.error('Invalid QR code'); return; }
    const ok = await verifyAttendanceLocation();
    if (!ok) return;
    const timeStr = formatTimeAZ(new Date());
    try {
      const { data: result, error } = await supabase.functions.invoke('qr-attendance', {
        body: { qr_data: data },
      });
      if (error || (result as any)?.error) {
        toast.error((result as any)?.error || 'Scan failed');
        return;
      }
      const r: any = result;
      const name = r.employee || 'Worker';
      if (r.action === 'checked_in') {
        setScanResults(prev => [{ name, action: 'Checked In', time: timeStr }, ...prev]);
        toast.success(`✅ ${name} checked in`);
      } else if (r.action === 'checked_out') {
        const hrs = ((r.worked_minutes || 0) / 60).toFixed(1);
        setScanResults(prev => [{ name, action: 'Checked Out', time: timeStr }, ...prev]);
        toast.success(`✅ ${name} checked out (${hrs}h)`);
      } else if (r.action === 'cooldown') {
        setScanResults(prev => [{ name, action: `Wait ${r.wait_minutes}m`, time: timeStr }, ...prev]);
        toast.info(`${name}: please wait ${r.wait_minutes} more minute(s) before scanning again`);
      } else if (r.action === 'already_completed') {
        setScanResults(prev => [{ name, action: 'Already Done', time: timeStr }, ...prev]);
        toast.info(`${name} already completed their shift`);
      }
    } catch {
      toast.error('Network error during scan');
    }
    // Camera stays active for next worker
  };

  const handleCheckOut = async () => {
    if (!record) return;
    const pauses = Array.isArray(record.pauses) ? [...record.pauses] : [];
    if (pauses.length > 0 && !pauses[pauses.length - 1].end) {
      pauses[pauses.length - 1].end = new Date().toISOString();
    }
    const workedMinutes = calculateWorked({ ...record, pauses, check_out: new Date().toISOString(), status: 'checked_out' }) / 60;
    const { error } = await supabase.from('attendance_records')
      .update({ check_out: new Date().toISOString(), status: 'checked_out', pauses, total_worked_minutes: workedMinutes })
      .eq('id', record.id);
    if (error) { toast.error('Error checking out'); return; }
    toast.success('Great work today! See you tomorrow! 🌟');
    await logActivity('check_out', `Checked out. Worked ${workedMinutes.toFixed(1)} minutes`);
    fetchToday();
  };

  const handlePauseClick = () => {
    setPauseReason('');
    setCustomReason('');
    setPauseOpen(true);
  };

  const handlePauseConfirm = async () => {
    if (!record) return;
    const reason = pauseReason === 'Other' ? customReason : pauseReason;
    if (!reason.trim()) { toast.error('Please select or enter a reason'); return; }
    const pauses = Array.isArray(record.pauses) ? [...record.pauses] : [];
    pauses.push({ start: new Date().toISOString(), end: null, reason });
    const workedMinutes = calculateWorked(record) / 60;
    const { error } = await supabase.from('attendance_records')
      .update({ pauses, status: 'paused', total_worked_minutes: workedMinutes })
      .eq('id', record.id);
    if (error) { toast.error('Error pausing'); return; }
    setPauseOpen(false);
    toast.success(`Timer paused — ${reason} ☕`);
    await logActivity('pause', `Paused: ${reason}`);
    fetchToday();
  };

  const handleResume = async () => {
    if (!record) return;
    const pauses = Array.isArray(record.pauses) ? [...record.pauses] : [];
    if (pauses.length > 0 && !pauses[pauses.length - 1].end) {
      pauses[pauses.length - 1].end = new Date().toISOString();
    }
    const { error } = await supabase.from('attendance_records')
      .update({ pauses, status: 'checked_in' })
      .eq('id', record.id);
    if (error) { toast.error('Error resuming'); return; }
    toast.success('Back to work! 💪');
    await logActivity('resume', 'Resumed timer');
    fetchToday();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-pulse text-primary text-sm">Loading...</div>
    </div>
  );

  const status = record?.status;
  const todayHours = elapsed / 3600;
  const dailyTarget = 8;
  const dailyProgress = Math.min((todayHours / dailyTarget) * 100, 100);
  const biweeklyProgress = Math.min((periodHours / BIWEEKLY_TARGET_HOURS) * 100, 100);

  const CircularProgress = ({ progress, size = 100, strokeWidth = 6, children }: { progress: number; size?: number; strokeWidth?: number; children?: React.ReactNode }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (progress / 100) * circumference;
    return (
      <div className="relative inline-flex items-center justify-center">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(var(--muted))" strokeWidth={strokeWidth} fill="none" />
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(var(--primary))" strokeWidth={strokeWidth} fill="none"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      </div>
    );
  };

  const StatusBadge = () => {
    const config = {
      checked_in: { icon: <Activity className="size-3" />, text: 'Working', cls: 'bg-primary/10 text-primary' },
      paused: { icon: <Coffee className="size-3" />, text: 'On Break', cls: 'bg-warning/10 text-warning' },
      checked_out: { icon: <CheckCircle2 className="size-3" />, text: 'Completed', cls: 'bg-muted text-muted-foreground' },
    };
    const current = config[status as keyof typeof config] || { icon: <Timer className="size-3" />, text: 'Not Started', cls: 'bg-accent text-accent-foreground' };
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium ${current.cls}`}>
        {status === 'checked_in' && <span className="size-1.5 rounded-full bg-primary animate-pulse" />}
        {status !== 'checked_in' && current.icon}
        {current.text}
      </span>
    );
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Pause Reason Dialog */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Pause Timer</DialogTitle>
            <DialogDescription className="text-xs">Select a reason for your break</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Select value={pauseReason} onValueChange={setPauseReason}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a reason..." /></SelectTrigger>
              <SelectContent>
                {PAUSE_REASONS.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {pauseReason === 'Other' && (
              <Input value={customReason} onChange={e => setCustomReason(e.target.value)} placeholder="Enter your reason..." className="h-8 text-xs" />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setPauseOpen(false)}>Cancel</Button>
            <Button size="sm" className="text-xs gap-1.5" onClick={handlePauseConfirm} disabled={!pauseReason || (pauseReason === 'Other' && !customReason.trim())}>
              <Pause className="size-3" /> Pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Confirmation Dialog */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Square className="size-4 text-destructive" /> Confirm Check Out
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to end your shift?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <Square className="size-7 text-destructive" />
            </div>
            <p className="text-xs text-center text-foreground">
              {checkoutMethod === 'fingerprint' ? 'You will be asked to verify your fingerprint.' : 'Your shift timer will be stopped.'}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" className="text-xs gap-1.5" onClick={confirmCheckout}>
              <ArrowRight className="size-3" /> Confirm Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin QR Checkout Confirmation Dialog */}
      <Dialog open={adminCheckoutOpen} onOpenChange={(open) => { if (!open) { setAdminCheckoutOpen(false); setAdminCheckoutPending(null); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Square className="size-4 text-destructive" /> Confirm Check Out
            </DialogTitle>
            <DialogDescription className="text-xs">
              QR verified for {adminCheckoutPending?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
              <Square className="size-7 text-destructive" />
            </div>
            <p className="text-xs text-center text-foreground">
              End shift for {adminCheckoutPending?.name}?
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => { setAdminCheckoutOpen(false); setAdminCheckoutPending(null); }}>Cancel</Button>
            <Button variant="destructive" size="sm" className="text-xs gap-1.5" onClick={async () => {
              if (!adminCheckoutPending) return;
              const rec = adminCheckoutPending.record;
              const pauses: any[] = Array.isArray(rec.pauses) ? [...rec.pauses] : [];
              if (pauses.length > 0 && !(pauses[pauses.length - 1] as any).end) {
                (pauses[pauses.length - 1] as any).end = new Date().toISOString();
              }
              const checkIn = new Date(rec.check_in!).getTime();
              let pausedMs = 0;
              for (const p of pauses) {
                const start = new Date((p as any).start).getTime();
                const end = (p as any).end ? new Date((p as any).end).getTime() : Date.now();
                pausedMs += end - start;
              }
              const workedMinutes = Math.max(0, (Date.now() - checkIn - pausedMs) / 60000);
              await supabase.from('attendance_records')
                .update({ check_out: new Date().toISOString(), status: 'checked_out', pauses, total_worked_minutes: workedMinutes })
                .eq('id', rec.id);
              await logActivity('check_out', `Checked out via admin QR scan. Worked ${workedMinutes.toFixed(1)} minutes`, rec.user_id);
              setScanResults(prev => [{ name: adminCheckoutPending.name, action: 'Checked Out', time: adminCheckoutPending.timeStr }, ...prev]);
              toast.success(`✅ ${adminCheckoutPending.name} checked out (${(workedMinutes / 60).toFixed(1)}h)`);
              setAdminCheckoutOpen(false);
              setAdminCheckoutPending(null);
            }}>
              <ArrowRight className="size-3" /> Confirm Check Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {greetingIcon}
          <div>
            <h2 className="text-lg font-semibold text-foreground">{greeting}, {profile?.full_name?.split(' ')[0] || 'there'}</h2>
            <p className="text-2xs text-muted-foreground">{formatDateAZ(new Date())} · Arizona Time</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge />
        </div>
      </div>

      {/* Admin Continuous QR Scanner */}
      {isAdmin && (
        <Card className="border-border/50 border-primary/20">
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
              <Camera className="size-3.5 text-primary" /> Admin QR Scanner
              <Badge variant="secondary" className="text-2xs ml-auto">Admin Only</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!adminScannerActive ? (
              <div className="flex flex-col items-center gap-3 py-3">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                  <Camera className="size-8 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Start continuous scanning mode to check workers in/out. The camera stays on — workers scan their QR codes one by one.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={() => { setAdminScannerActive(true); setScanResults([]); }} size="sm" className="gap-1.5 rounded-full px-6 text-xs">
                    <Camera className="size-3.5" /> Start Scanning
                  </Button>
                  <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full px-6 text-xs">
                    <a href="/scanner" target="_blank" rel="noreferrer"><ScanLine className="size-3.5" /> Open Standalone Session</a>
                  </Button>
                </div>
                <p className="text-2xs text-muted-foreground text-center">
                  Tip: open the standalone session in another tab — it keeps running even after you log out.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="shrink-0">
                    <QRScanner onScan={handleAdminQRScan} scanning={adminScannerActive} allowDeviceSelection />
                  </div>
                  <div className="flex-1 w-full">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium text-foreground">Scan Log</h4>
                      <Badge variant="default" className="text-2xs animate-pulse">Live</Badge>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border border-border/50 p-2 bg-muted/10">
                      {scanResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Waiting for workers to scan...</p>
                      ) : scanResults.map((r, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md px-2.5 py-1.5 bg-background border border-border/30">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className={`size-3.5 ${r.action === 'Checked In' ? 'text-primary' : r.action === 'Checked Out' ? 'text-destructive' : 'text-muted-foreground'}`} />
                            <span className="text-xs font-medium text-foreground">{r.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={r.action === 'Checked In' ? 'default' : r.action === 'Checked Out' ? 'destructive' : 'secondary'} className="text-2xs">
                              {r.action}
                            </Badge>
                            <span className="text-2xs text-muted-foreground">{r.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-2xs text-muted-foreground mt-2">{scanResults.length} worker(s) scanned</p>
                  </div>
                </div>
                <Button onClick={() => setAdminScannerActive(false)} variant="destructive" size="sm" className="gap-1.5 text-xs w-full">
                  <Square className="size-3" /> Stop Scanner
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Check-In Methods (non-admin personal) */}
      {!record && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 px-4 pt-3">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
              <Zap className="size-3.5 text-primary" /> Quick Check-In
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Tabs defaultValue="fingerprint" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="fingerprint" className="gap-1.5 text-2xs"><Fingerprint className="size-3" /> Fingerprint</TabsTrigger>
                <TabsTrigger value="manual" className="gap-1.5 text-2xs"><Play className="size-3" /> Manual</TabsTrigger>
              </TabsList>

              <TabsContent value="fingerprint" className="mt-3">
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                    <Fingerprint className="size-8 text-primary" />
                  </div>
                  <p className="text-2xs text-muted-foreground text-center">Use your registered fingerprint to check in</p>
                  <Button onClick={handleFingerprintCheckIn} disabled={bioLoading} size="sm" className="gap-1.5 rounded-full px-6 text-xs">
                    <Fingerprint className="size-3.5" /> {bioLoading ? 'Verifying...' : 'Check In with Fingerprint'}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="manual" className="mt-3">
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                    <Play className="size-7 text-primary" />
                  </div>
                  <p className="text-2xs text-muted-foreground text-center">Tap to start your shift</p>
                  <Button onClick={handleCheckIn} size="sm" className="gap-1.5 rounded-full px-6 text-xs">
                    <Play className="size-3.5" /> Check In
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {/* Timer Card */}
        <Card className="sm:col-span-2 lg:col-span-1 border-border/50">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <Clock className="size-3.5 text-primary" /> Today's Timer
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 px-4 pb-4 pt-2">
            <CircularProgress progress={dailyProgress} size={130} strokeWidth={8}>
              <span className="font-mono text-xl font-bold text-foreground">{formatTime(elapsed)}</span>
              <span className="text-2xs text-muted-foreground">{todayHours.toFixed(1)}h / {dailyTarget}h</span>
            </CircularProgress>

            <StatusBadge />

            <div className="flex gap-2 flex-wrap justify-center">
              {status === 'checked_in' && (
                <>
                  <Button onClick={handlePauseClick} variant="outline" size="sm" className="gap-1.5 rounded-full text-xs">
                    <Pause className="size-3.5" /> Pause
                  </Button>
                  <Button onClick={() => requestCheckout('fingerprint')} disabled={bioLoading} variant="outline" size="sm" className="gap-1.5 rounded-full text-xs">
                    <Fingerprint className="size-3.5" /> Fingerprint Out
                  </Button>
                  <Button onClick={() => requestCheckout('manual')} variant="destructive" size="sm" className="gap-1.5 rounded-full text-xs">
                    <Square className="size-3.5" /> Check Out
                  </Button>
                </>
              )}
              {status === 'paused' && (
                <>
                  <Button onClick={handleResume} size="sm" className="gap-1.5 rounded-full text-xs">
                    <Play className="size-3.5" /> Resume
                  </Button>
                  <Button onClick={() => requestCheckout('manual')} variant="destructive" size="sm" className="gap-1.5 rounded-full text-xs">
                    <Square className="size-3.5" /> Check Out
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Biweekly Progress */}
        <Card className="border-border/50">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <CalendarDays className="size-3.5 text-primary" /> Biweekly Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 px-4 pb-4 pt-2">
            <CircularProgress progress={biweeklyProgress} size={110} strokeWidth={7}>
              <span className="text-lg font-bold text-foreground">{periodHours.toFixed(1)}h</span>
              <span className="text-2xs text-muted-foreground">of {BIWEEKLY_TARGET_HOURS}h</span>
            </CircularProgress>
            <Progress value={biweeklyProgress} className="h-1.5 w-full" />
            <p className="text-2xs text-muted-foreground text-center">
              {(BIWEEKLY_TARGET_HOURS - periodHours).toFixed(1)}h remaining
            </p>
          </CardContent>
        </Card>

        {/* Today's Details */}
        <Card className="border-border/50">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <User className="size-3.5 text-primary" /> Today's Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-4 pt-2">
            <div className="text-center pb-1">
              <p className="text-xs font-medium text-foreground">{formatDateAZ(new Date())}</p>
              <p className="text-2xs text-muted-foreground">Arizona Time (MST)</p>
            </div>
            <Separator />
            <div className="space-y-1.5">
              {[
                { label: 'Check In', value: record?.check_in ? formatTimeAZ(record.check_in) : '—' },
                { label: 'Check Out', value: record?.check_out ? formatTimeAZ(record.check_out) : '—' },
                { label: 'Breaks', value: String(Array.isArray(record?.pauses) ? record.pauses.length : 0) },
                { label: 'Employee', value: profile?.full_name || 'N/A' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-1.5">
                  <span className="text-2xs text-muted-foreground">{item.label}</span>
                  <span className="text-2xs font-medium text-foreground truncate max-w-[120px]">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Break History */}
      {record && Array.isArray(record.pauses) && record.pauses.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <Coffee className="size-3.5 text-warning" /> Break History
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {record.pauses.map((p: any, i: number) => {
                const start = new Date(p.start);
                const end = p.end ? new Date(p.end) : null;
                const duration = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-2">
                    <Coffee className="size-3 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs font-medium text-foreground truncate">{p.reason || 'Break'}</p>
                      <p className="text-2xs text-muted-foreground">
                        {formatTimeAZ(start)} {end ? `→ ${formatTimeAZ(end)}` : '→ ongoing'}
                        {duration != null && ` · ${duration}m`}
                      </p>
                    </div>
                    <Badge variant={end ? 'secondary' : 'default'} className="text-2xs shrink-0">
                      {end ? 'Done' : 'Active'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CheckIn;
