import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Banknote, Clock, CalendarDays, TrendingUp, Wallet, PiggyBank } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';

const PaySummary = () => {
  const { user, roles } = useAuth();
  const { currentPeriod } = useSystemSettings();
  const [hourlyRate, setHourlyRate] = useState(0);
  const [periodHours, setPeriodHours] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      const { data: userRate } = await supabase.from('pay_rates').select('hourly_rate').eq('user_id', user.id).maybeSingle();
      if (userRate) { setHourlyRate(Number(userRate.hourly_rate)); }
      else if (roles.length > 0) {
        const { data: roleRate } = await supabase.from('pay_rates').select('hourly_rate').eq('role', roles[0]).is('user_id', null).maybeSingle();
        if (roleRate) setHourlyRate(Number(roleRate.hourly_rate));
      }
      const { data: records } = await supabase.from('attendance_records').select('total_worked_minutes').eq('user_id', user.id)
        .gte('date', currentPeriod.startISO).lte('date', currentPeriod.endISO);
      if (records) setPeriodHours(records.reduce((sum: number, r: any) => sum + Number(r.total_worked_minutes || 0), 0) / 60);
      setLoading(false);
    };
    fetch();
  }, [user, roles, currentPeriod.startISO, currentPeriod.endISO]);

  const start = currentPeriod.start;
  const end = currentPeriod.end;
  const estimatedPay = hourlyRate * periodHours;
  const maxPay = hourlyRate * 80;
  const payProgress = maxPay > 0 ? Math.min((estimatedPay / maxPay) * 100, 100) : 0;
  const hoursProgress = Math.min((periodHours / 80) * 100, 100);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-primary text-lg">Loading...</div></div>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/50 bg-gradient-soft p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Pay & Hours Summary</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Current biweekly period</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--accent-blue))]/30 bg-background/70 backdrop-blur px-3 py-1.5 self-start sm:self-auto">
          <CalendarDays className="size-4 text-[hsl(var(--accent-blue))]" />
          <span className="text-xs font-medium text-foreground">{start.toLocaleDateString()} - {end.toLocaleDateString()}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Banknote className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hourly Rate</p>
              <p className="text-2xl font-bold text-foreground">${hourlyRate.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Clock className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hours Worked</p>
              <p className="text-2xl font-bold text-foreground">{periodHours.toFixed(1)}h</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Wallet className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated Pay</p>
              <p className="text-2xl font-bold text-primary">${estimatedPay.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <PiggyBank className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Max Potential</p>
              <p className="text-2xl font-bold text-foreground">${maxPay.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="size-5 text-primary" /> Hours Progress</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Progress value={hoursProgress} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{periodHours.toFixed(1)}h worked</span>
              <span>80h target</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Banknote className="size-5 text-primary" /> Earnings Progress</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Progress value={payProgress} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>${estimatedPay.toFixed(2)} earned</span>
              <span>${maxPay.toFixed(2)} max</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaySummary;
