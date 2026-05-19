import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays, Clock, TrendingUp, Coffee, Printer, X } from 'lucide-react';
import { formatTimeAZ, formatDateShortAZ, formatDateWeekdayShortAZ, formatDateTimeFullAZ } from '@/lib/timezone';

const AttendanceHistory = () => {
  const { user, profile } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(200);
      setRecords(data || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      return true;
    });
  }, [records, startDate, endDate]);

  const clearFilters = () => { setStartDate(''); setEndDate(''); };

  const handlePrint = () => {
    const employeeName = profile?.full_name || 'Employee';
    const employeeEmail = profile?.email || '';
    const rangeLabel =
      startDate || endDate
        ? `${startDate || '…'} to ${endDate || '…'}`
        : 'All Records';

    const totalH = filtered.reduce((s, r) => s + Number(r.total_worked_minutes || 0), 0) / 60;
    const completed = filtered.filter((r) => r.status === 'checked_out').length;
    const breaks = filtered.reduce((s, r) => s + (Array.isArray(r.pauses) ? r.pauses.length : 0), 0);

    const rows = filtered
      .map((r) => {
        const hours = (Number(r.total_worked_minutes || 0) / 60).toFixed(2);
        const dateStr = formatDateWeekdayShortAZ(r.date) + ', ' + new Date(r.date).getFullYear();
        const ci = r.check_in ? formatTimeAZ(r.check_in) : '-';
        const co = r.check_out ? formatTimeAZ(r.check_out) : '-';
        const status = r.status === 'checked_in' ? 'Working' : r.status === 'paused' ? 'Paused' : 'Completed';
        const pauseCount = Array.isArray(r.pauses) ? r.pauses.length : 0;
        return `<tr>
          <td>${dateStr}</td>
          <td>${ci}</td>
          <td>${co}</td>
          <td style="text-align:center">${pauseCount}</td>
          <td style="text-align:right;font-weight:600">${hours}h</td>
          <td><span class="badge ${status.toLowerCase()}">${status}</span></td>
        </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Attendance Report - ${employeeName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; color: #0f172a; margin: 0; padding: 40px; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0d9488; padding-bottom: 20px; margin-bottom: 28px; }
  .brand { font-size: 22px; font-weight: 800; color: #0d9488; letter-spacing: -0.02em; }
  .brand-sub { font-size: 12px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em; }
  .meta { text-align: right; font-size: 12px; color: #64748b; }
  .meta strong { color: #0f172a; font-size: 14px; display: block; margin-bottom: 2px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; background: #f8fafc; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 6px; }
  .stat-value { font-size: 20px; font-weight: 700; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th { background: #0f172a; color: #fff; text-align: left; padding: 10px 12px; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.completed { background: #dcfce7; color: #166534; }
  .badge.working { background: #dbeafe; color: #1e40af; }
  .badge.paused { background: #fee2e2; color: #991b1b; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  @media print { body { padding: 20px; } .stats { page-break-inside: avoid; } tr { page-break-inside: avoid; } }
</style></head><body>
  <div class="header">
    <div>
      <div class="brand">My City Radius</div>
      <div class="brand-sub">Time & Attendance</div>
    </div>
    <div class="meta">
      <strong>${employeeName}</strong>
      ${employeeEmail}<br/>
      Generated ${formatDateTimeFullAZ(new Date())} (Arizona)
    </div>
  </div>
  <h1>Attendance Report</h1>
  <div class="subtitle">Period: ${rangeLabel} • ${filtered.length} record${filtered.length === 1 ? '' : 's'}</div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Days Worked</div><div class="stat-value">${completed}</div></div>
    <div class="stat"><div class="stat-label">Total Hours</div><div class="stat-value">${totalH.toFixed(1)}h</div></div>
    <div class="stat"><div class="stat-label">Avg Hours/Day</div><div class="stat-value">${completed ? (totalH / completed).toFixed(1) : '0.0'}h</div></div>
    <div class="stat"><div class="stat-label">Total Breaks</div><div class="stat-value">${breaks}</div></div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th style="text-align:center">Breaks</th><th style="text-align:right">Hours</th><th>Status</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:24px;color:#94a3b8">No records in selected range</td></tr>'}</tbody>
  </table>
  <div class="footer">
    <span>My City Radius • Confidential</span>
    <span>${employeeName}</span>
  </div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-primary text-lg">Loading...</div></div>;

  const totalHours = filtered.reduce((sum, r) => sum + Number(r.total_worked_minutes || 0), 0) / 60;
  const completedDays = filtered.filter(r => r.status === 'checked_out').length;
  const avgHours = completedDays > 0 ? totalHours / completedDays : 0;
  const totalBreaks = filtered.reduce((sum, r) => sum + (Array.isArray(r.pauses) ? r.pauses.length : 0), 0);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Attendance History</h2>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <CalendarDays className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Days Worked</p>
              <p className="text-xl font-bold text-foreground">{completedDays}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Hours</p>
              <p className="text-xl font-bold text-foreground">{totalHours.toFixed(1)}h</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Hours/Day</p>
              <p className="text-xl font-bold text-foreground">{avgHours.toFixed(1)}h</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Coffee className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Breaks</p>
              <p className="text-xl font-bold text-foreground">{totalBreaks}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Recent Records</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Filter by date range and export as PDF</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor="start" className="text-xs">From</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-[150px]" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="end" className="text-xs">To</Label>
              <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 w-[150px]" />
            </div>
            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="size-4 mr-1" /> Clear
              </Button>
            )}
            <Button size="sm" onClick={handlePrint} className="h-9">
              <Printer className="size-4 mr-2" /> Print PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Breaks</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No records found</TableCell></TableRow>
                ) : filtered.map((r) => {
                  const hours = Number(r.total_worked_minutes || 0) / 60;
                  const pct = Math.min((hours / 8) * 100, 100);
                  return (
                    <TableRow key={r.id} className="hover:bg-accent/30 transition-colors">
                      <TableCell className="font-medium">{formatDateWeekdayShortAZ(r.date)}</TableCell>
                      <TableCell>{r.check_in ? formatTimeAZ(r.check_in) : '-'}</TableCell>
                      <TableCell>{r.check_out ? formatTimeAZ(r.check_out) : '-'}</TableCell>
                      <TableCell>{Array.isArray(r.pauses) ? r.pauses.length : 0}</TableCell>
                      <TableCell className="font-semibold">{hours.toFixed(1)}h</TableCell>
                      <TableCell className="min-w-[100px]"><Progress value={pct} className="h-2" /></TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'checked_in' ? 'default' : r.status === 'paused' ? 'destructive' : 'secondary'}>
                          {r.status === 'checked_in' ? 'Working' : r.status === 'paused' ? 'Paused' : 'Completed'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceHistory;
