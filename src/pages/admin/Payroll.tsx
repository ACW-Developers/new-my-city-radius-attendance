import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Banknote, Users, Clock, Search, TrendingUp } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { formatDateShortAZ } from '@/lib/timezone';

const Payroll = () => {
  const { currentPeriod } = useSystemSettings();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetch = async () => {
      const { data: profiles } = await supabase.from('profiles').select('*');
      const { data: roles } = await supabase.from('user_roles').select('*');
      const { data: payRates } = await supabase.from('pay_rates').select('*');
      const { data: records } = await supabase.from('attendance_records').select('*')
        .gte('date', currentPeriod.startISO).lte('date', currentPeriod.endISO);

      const result = (profiles || []).map(p => {
        const userRoles = (roles || []).filter((r: any) => r.user_id === p.user_id);
        const userRecords = (records || []).filter((r: any) => r.user_id === p.user_id);
        const totalHours = userRecords.reduce((sum: number, r: any) => sum + Number(r.total_worked_minutes || 0), 0) / 60;
        const individualRate = (payRates || []).find((r: any) => r.user_id === p.user_id);
        let rate = individualRate ? Number(individualRate.hourly_rate) : 0;
        if (!individualRate && userRoles.length > 0) {
          const roleRate = (payRates || []).find((r: any) => r.role === userRoles[0].role && !r.user_id);
          rate = roleRate ? Number(roleRate.hourly_rate) : 0;
        }
        return { ...p, roles: userRoles.map((r: any) => r.role), totalHours, hourlyRate: rate, totalPay: rate * totalHours };
      });
      setData(result);
      setLoading(false);
    };
    fetch();
  }, [currentPeriod.startISO, currentPeriod.endISO]);

  const start = currentPeriod.start;
  const end = currentPeriod.end;
  const totalPay = data.reduce((sum, e) => sum + e.totalPay, 0);
  const totalHours = data.reduce((sum, e) => sum + e.totalHours, 0);
  const activeWorkers = data.filter(d => d.totalHours > 0).length;

  const filtered = data.filter(e => !search || e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/50 bg-gradient-soft p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">Payroll Report</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Auto-synced with current biweekly period</p>
        </div>
        <Badge variant="secondary" className="gap-1 text-xs border border-[hsl(var(--accent-blue))]/30 self-start sm:self-auto">
          {formatDateShortAZ(start)} - {formatDateShortAZ(end)}
        </Badge>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Banknote className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Payroll</p><p className="text-xl font-bold text-primary">${totalPay.toFixed(2)}</p></div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Clock className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Hours</p><p className="text-xl font-bold text-foreground">{totalHours.toFixed(1)}h</p></div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Users className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Active Workers</p><p className="text-xl font-bold text-foreground">{activeWorkers}</p></div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><TrendingUp className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Avg Pay</p><p className="text-xl font-bold text-foreground">${activeWorkers > 0 ? (totalPay / activeWorkers).toFixed(2) : '0'}</p></div>
          </CardContent>
        </Card>
      </div>

      {loading ? <div className="animate-pulse text-primary text-center py-8">Loading...</div> : (
        <Card className="border-border/50">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">Biweekly Summary</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Rate ($/hr)</TableHead>
                    <TableHead>Total Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(emp => (
                    <TableRow key={emp.id} className="hover:bg-accent/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {(emp.full_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{emp.full_name || emp.email}</p>
                            <p className="text-xs text-muted-foreground">{emp.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize text-xs">{emp.roles.join(', ').replace(/_/g, ' ') || 'Unassigned'}</Badge></TableCell>
                      <TableCell className="font-medium">{emp.totalHours.toFixed(1)}h</TableCell>
                      <TableCell>${emp.hourlyRate.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold text-primary">${emp.totalPay.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 border-border">
                    <TableCell colSpan={4} className="font-bold text-foreground">Total Payroll</TableCell>
                    <TableCell className="font-bold text-primary text-lg">${totalPay.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Payroll;
