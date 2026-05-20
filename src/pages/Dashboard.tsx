import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Clock, CalendarDays, Banknote, TrendingUp, UserCheck, Coffee,
  Flame, Award, Activity, Sun, Moon as MoonIcon, ArrowRight, Sparkles, RefreshCw,
} from 'lucide-react';
import { getAutoCheckoutHourForRoles, formatHour12 } from '@/lib/roleLabels';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import {
  getTodayDateStringAZ, toAZDateString, getCurrentHourAZ,
  formatDateAZ, formatTimeAZ, formatDateWeekdayShortAZ,
} from '@/lib/timezone';
import { useSystemSettings } from '@/hooks/useSystemSettings';

const DAILY_TARGET = 8;
const BIWEEKLY_TARGET = 80;

const Dashboard = () => {
  const { user, profile, roles } = useAuth();
  const { currentPeriod } = useSystemSettings();
  const [todayRecord, setTodayRecord] = useState<any>(null);
  const [weeklyHours, setWeeklyHours] = useState(0);
  const [periodHours, setPeriodHours] = useState(0);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [recentShifts, setRecentShifts] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const [longestShift, setLongestShift] = useState(0);
  const [breakCount, setBreakCount] = useState(0);
  const [hourlyRate, setHourlyRate] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState(0);

  const today = getTodayDateStringAZ();
  const hour = getCurrentHourAZ();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const greetingIcon = hour < 17
    ? <Sun className="size-5 text-warning" />
    : <MoonIcon className="size-5 text-primary" />;

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Today
      const { data: todayData } = await supabase
        .from('attendance_records').select('*')
        .eq('user_id', user.id).eq('date', today).maybeSingle();
      setTodayRecord(todayData);

      // Last 30 days for streak, longest, weekly chart, recent
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
      const { data: monthRecs } = await supabase
        .from('attendance_records').select('*')
        .eq('user_id', user.id)
        .gte('date', toAZDateString(monthAgo))
        .order('date', { ascending: false });
      const recs = monthRecs || [];
      setRecentShifts(recs.slice(0, 5));

      // Longest single shift (minutes -> hours)
      const longest = recs.reduce((m, r) => Math.max(m, Number(r.total_worked_minutes || 0)), 0);
      setLongestShift(longest / 60);

      // Total breaks (last 30 days)
      const breaks = recs.reduce((s, r) => s + (Array.isArray(r.pauses) ? r.pauses.length : 0), 0);
      setBreakCount(breaks);

      // Streak: consecutive days (ending yesterday or today) with a record
      const dateSet = new Set(recs.map((r: any) => r.date));
      let s = 0;
      const cursor = new Date();
      // include today if recorded, else start from yesterday
      if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1);
      while (dateSet.has(toAZDateString(cursor))) {
        s += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      setStreak(s);

      // Weekly chart (Mon-Sun) using AZ date keys
      const startOfWeek = new Date();
      const dow = startOfWeek.getDay(); // Sun=0
      const diff = dow === 0 ? -6 : 1 - dow;
      startOfWeek.setDate(startOfWeek.getDate() + diff);
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      let weekTotal = 0;
      const chart = days.map((day, i) => {
        const d = new Date(startOfWeek); d.setDate(d.getDate() + i);
        const ds = toAZDateString(d);
        const dayRecs = recs.filter((r: any) => r.date === ds);
        const hrs = dayRecs.reduce((sum, r) => sum + Number(r.total_worked_minutes || 0), 0) / 60;
        weekTotal += hrs;
        return { name: day, hours: +hrs.toFixed(2), target: DAILY_TARGET };
      });
      setWeeklyData(chart);
      setWeeklyHours(weekTotal);

      // Biweekly hours
      const { data: periodRecs } = await supabase
        .from('attendance_records').select('total_worked_minutes')
        .eq('user_id', user.id)
        .gte('date', currentPeriod.startISO).lte('date', currentPeriod.endISO);
      setPeriodHours((periodRecs || []).reduce((s, r) => s + Number(r.total_worked_minutes || 0), 0) / 60);

      // Pay rate
      const { data: userRate } = await supabase.from('pay_rates')
        .select('hourly_rate').eq('user_id', user.id).maybeSingle();
      if (userRate) setHourlyRate(Number(userRate.hourly_rate));
      else if (roles.length > 0) {
        const { data: roleRate } = await supabase.from('pay_rates')
          .select('hourly_rate').eq('role', roles[0]).is('user_id', null).maybeSingle();
        if (roleRate) setHourlyRate(Number(roleRate.hourly_rate));
      }
    };
    fetchData();
  }, [user, roles, today, currentPeriod.startISO, currentPeriod.endISO]);

  // Live elapsed timer for current shift
  useEffect(() => {
    if (!todayRecord || todayRecord.status === 'checked_out') {
      if (todayRecord) {
        setLiveElapsed(Number(todayRecord.total_worked_minutes || 0) * 60);
      }
      return;
    }
    const calc = () => {
      const ci = new Date(todayRecord.check_in).getTime();
      let pausedMs = 0;
      const ps = Array.isArray(todayRecord.pauses) ? todayRecord.pauses : [];
      for (const p of ps) {
        const start = new Date(p.start).getTime();
        const end = p.end ? new Date(p.end).getTime() : Date.now();
        pausedMs += end - start;
      }
      setLiveElapsed(Math.max(0, Math.floor((Date.now() - ci - pausedMs) / 1000)));
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [todayRecord]);

  const todayHours = liveElapsed / 3600;
  const dailyProgress = Math.min((todayHours / DAILY_TARGET) * 100, 100);
  const biweeklyProgress = Math.min((periodHours / BIWEEKLY_TARGET) * 100, 100);
  const avgDailyHours = useMemo(() => {
    const worked = weeklyData.filter(d => d.hours > 0);
    if (!worked.length) return 0;
    return worked.reduce((s, d) => s + d.hours, 0) / worked.length;
  }, [weeklyData]);
  const estimatedPay = periodHours * hourlyRate;

  const statusBadge = (() => {
    if (!todayRecord) return { text: 'Not Started', cls: 'bg-muted text-muted-foreground', dot: false };
    if (todayRecord.status === 'checked_in') return { text: 'On Shift', cls: 'bg-primary/15 text-primary', dot: true };
    if (todayRecord.status === 'paused') return { text: 'On Break', cls: 'bg-warning/15 text-warning', dot: false };
    return { text: 'Completed', cls: 'bg-success/15 text-success', dot: false };
  })();

  const fmtElapsed = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const radialData = [{ name: 'Today', value: dailyProgress, fill: 'hsl(var(--primary))' }];

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Hero greeting */}
      <div className="rounded-2xl border border-border/50 bg-gradient-soft p-5 shadow-sm relative overflow-hidden">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 size-40 rounded-full bg-[hsl(var(--accent-blue))]/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-background/60 backdrop-blur border border-border/40">
              {greetingIcon}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                {greeting}, {profile?.full_name?.split(' ')[0] || 'Caregiver'}
              </h2>
              <p className="text-2xs text-muted-foreground">{formatDateAZ(new Date())} · Arizona Time</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-medium ${statusBadge.cls}`}>
              {statusBadge.dot && <span className="size-1.5 rounded-full bg-primary animate-pulse" />}
              {statusBadge.text}
            </span>
            <Button asChildLink to="/dashboard/checkin" />
            <button
              type="button"
              onClick={handleHardRefresh}
              title="Clear cache & refresh"
              aria-label="Refresh and clear cache"
              className="inline-flex size-8 items-center justify-center rounded-full border border-border/40 bg-background/60 backdrop-blur text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Hero metrics: live shift + biweekly radial + pay */}
      <div className="grid gap-3 lg:grid-cols-3">
        {/* Live shift */}
        <Card className="border-border/50 lg:col-span-2 relative overflow-hidden">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <Activity className="size-3.5 text-primary" /> Live Shift
              <Badge variant="secondary" className="ml-auto text-2xs">Auto-out</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="sm:col-span-1 flex items-center justify-center">
                <div className="relative size-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="50%" innerRadius="85%" outerRadius="100%" data={radialData} startAngle={90} endAngle={-270}>
                      <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                      <RadialBar background={{ fill: 'hsl(var(--muted))' }} dataKey="value" cornerRadius={20} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-lg font-bold text-foreground">{fmtElapsed(liveElapsed)}</span>
                    <span className="text-2xs text-muted-foreground">{todayHours.toFixed(1)}h / {DAILY_TARGET}h</span>
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 grid grid-cols-2 gap-2">
                <Tile icon={<Clock className="size-3.5 text-primary" />} label="Check In" value={todayRecord?.check_in ? formatTimeAZ(todayRecord.check_in) : '—'} />
                <Tile icon={<ArrowRight className="size-3.5 text-destructive" />} label="Check Out" value={todayRecord?.check_out ? formatTimeAZ(todayRecord.check_out) : '—'} />
                <Tile icon={<Coffee className="size-3.5 text-warning" />} label="Breaks Today" value={String(Array.isArray(todayRecord?.pauses) ? todayRecord.pauses.length : 0)} />
                <Tile icon={<TrendingUp className="size-3.5 text-[hsl(var(--accent-blue))]" />} label="Daily Progress" value={`${dailyProgress.toFixed(0)}%`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Biweekly + pay */}
        <Card className="border-border/50">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <CalendarDays className="size-3.5 text-primary" /> Biweekly Period
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-2">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-bold text-foreground leading-none">{periodHours.toFixed(1)}h</p>
                <p className="text-2xs text-muted-foreground mt-1">of {BIWEEKLY_TARGET}h target</p>
              </div>
              <div className="text-right">
                <p className="text-2xs text-muted-foreground">Est. Pay</p>
                <p className="text-lg font-bold text-primary">${estimatedPay.toFixed(2)}</p>
              </div>
            </div>
            <Progress value={biweeklyProgress} className="h-2" />
            <div className="flex items-center justify-between text-2xs text-muted-foreground">
              <span>{(BIWEEKLY_TARGET - periodHours).toFixed(1)}h remaining</span>
              <span>${hourlyRate.toFixed(2)}/h</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick stats row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Flame className="size-4 text-[hsl(var(--chart-1))]" />} bg="bg-[hsl(var(--chart-1))]/10" label="Active Streak" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} />
        <StatCard icon={<TrendingUp className="size-4 text-[hsl(var(--chart-2))]" />} bg="bg-[hsl(var(--chart-2))]/10" label="Weekly Total" value={`${weeklyHours.toFixed(1)}h`} />
        <StatCard icon={<Award className="size-4 text-[hsl(var(--chart-3))]" />} bg="bg-[hsl(var(--chart-3))]/10" label="Longest Shift" value={`${longestShift.toFixed(1)}h`} />
        <StatCard icon={<Coffee className="size-4 text-[hsl(var(--chart-4))]" />} bg="bg-[hsl(var(--chart-4))]/10" label="Breaks (30d)" value={String(breakCount)} />
      </div>

      {/* Charts + recent shifts */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="size-3.5 text-primary" /> This Week · Avg {avgDailyHours.toFixed(1)}h/day
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 -ml-10 pt-2">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="dashHours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={true} />
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: 'hsl(var(--primary))', fontSize: 10 }}
                    axisLine={{ stroke: 'hsl(var(--primary))' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px', fontSize: '11px',
                    }}
                  />
                  <Area type="monotone" dataKey="hours" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#dashHours)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-1 px-4 pt-3">
            <CardTitle className="flex items-center gap-1.5 text-xs font-medium">
              <UserCheck className="size-3.5 text-primary" /> Recent Shifts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-2">
            {recentShifts.length === 0 ? (
              <p className="text-2xs text-muted-foreground text-center py-6">No recent shifts yet.</p>
            ) : (
              <div className="space-y-1.5">
                {recentShifts.map(r => {
                  const hrs = Number(r.total_worked_minutes || 0) / 60;
                  const ci = r.check_in ? formatTimeAZ(r.check_in) : '—';
                  const co = r.check_out ? formatTimeAZ(r.check_out) : '—';
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-md border border-border/40 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="text-2xs font-medium text-foreground truncate">{formatDateWeekdayShortAZ(r.date)}</p>
                        <p className="text-2xs text-muted-foreground">{ci} → {co}</p>
                      </div>
                      <Badge variant="secondary" className="text-2xs shrink-0">{hrs.toFixed(1)}h</Badge>
                    </div>
                  );
                })}
                <Link to="/dashboard/attendance" className="block text-2xs text-primary hover:underline pt-1 text-center">
                  View full history →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Tile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-2.5 py-2">
    <div className="flex size-7 items-center justify-center rounded-md bg-muted/40 shrink-0">{icon}</div>
    <div className="min-w-0">
      <p className="text-2xs text-muted-foreground leading-tight">{label}</p>
      <p className="text-xs font-semibold text-foreground truncate">{value}</p>
    </div>
  </div>
);

const StatCard = ({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) => (
  <Card className="border-border/50">
    <CardContent className="flex items-center justify-between p-3 sm:p-4">
      <div className="min-w-0">
        <p className="text-2xs text-muted-foreground">{label}</p>
        <p className="text-lg sm:text-xl font-bold text-foreground truncate">{value}</p>
      </div>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}>{icon}</div>
    </CardContent>
  </Card>
);

// Tiny link helper to avoid extra imports
const Button = ({ asChildLink, to }: { asChildLink?: boolean; to?: string }) =>
  asChildLink && to ? (
    <Link to={to} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 transition">
      Open Check-In <ArrowRight className="size-3" />
    </Link>
  ) : null;

export default Dashboard;
