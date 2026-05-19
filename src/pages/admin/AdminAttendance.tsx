import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CalendarDays, Users, Clock, Search, Pencil, Trash2, Download, Filter, RefreshCw, Printer } from 'lucide-react';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { formatTimeAZ, formatTimeAZ24, formatDateAZ, formatDateShortAZ, formatDateTimeFullAZ } from '@/lib/timezone';

const AdminAttendance = () => {
  const { user } = useAuth();
  const { currentPeriod } = useSystemSettings();
  const [records, setRecords] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(currentPeriod.startISO);
  const [dateTo, setDateTo] = useState(currentPeriod.endISO);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [editRecord, setEditRecord] = useState<any>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');

  // Sync dates with current biweekly period when anchor changes
  useEffect(() => {
    setDateFrom(currentPeriod.startISO);
    setDateTo(currentPeriod.endISO);
  }, [currentPeriod.startISO, currentPeriod.endISO]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*');
    setEmployees(profiles || []);

    let query = supabase.from('attendance_records').select('*')
      .gte('date', dateFrom).lte('date', dateTo)
      .order('date', { ascending: false });

    if (selectedEmployee !== 'all') {
      query = query.eq('user_id', selectedEmployee);
    }

    const { data } = await query;
    setRecords(data || []);
    setLoading(false);
  }, [dateFrom, dateTo, selectedEmployee]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-attendance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const getName = (userId: string) => {
    const emp = employees.find(e => e.user_id === userId);
    return emp?.full_name || emp?.email || userId;
  };

  const getEmail = (userId: string) => {
    const emp = employees.find(e => e.user_id === userId);
    return emp?.email || '';
  };

  const logActivity = async (action: string, details?: string) => {
    if (!user) return;
    await supabase.from('activity_logs').insert({ user_id: user.id, action, details });
  };

  const handleEdit = (rec: any) => {
    setEditRecord(rec);
    setEditCheckIn(rec.check_in ? formatTimeAZ24(rec.check_in) : '');
    setEditCheckOut(rec.check_out ? formatTimeAZ24(rec.check_out) : '');
  };

  const saveEdit = async () => {
    if (!editRecord) return;
    const updates: any = {};
    if (editCheckIn) {
      const [h, m] = editCheckIn.split(':');
      const d = new Date(editRecord.date);
      d.setHours(parseInt(h), parseInt(m), 0);
      updates.check_in = d.toISOString();
    }
    if (editCheckOut) {
      const [h, m] = editCheckOut.split(':');
      const d = new Date(editRecord.date);
      d.setHours(parseInt(h), parseInt(m), 0);
      updates.check_out = d.toISOString();
      updates.status = 'checked_out';
    }
    if (updates.check_in && updates.check_out) {
      const diff = (new Date(updates.check_out).getTime() - new Date(updates.check_in).getTime()) / 60000;
      updates.total_worked_minutes = Math.max(0, diff);
    }
    const { error } = await supabase.from('attendance_records').update(updates).eq('id', editRecord.id);
    if (error) toast.error('Error updating');
    else { toast.success('Record updated'); await logActivity('edit_attendance', `Edited attendance for ${getName(editRecord.user_id)}`); setEditRecord(null); fetchData(); }
  };

  const deleteRecord = async (rec: any) => {
    if (!confirm(`Delete attendance record for ${getName(rec.user_id)}?`)) return;
    const { error } = await supabase.from('attendance_records').delete().eq('id', rec.id);
    if (error) toast.error('Error deleting');
    else { toast.success('Record deleted'); await logActivity('delete_attendance', `Deleted attendance for ${getName(rec.user_id)}`); fetchData(); }
  };

  const filtered = records.filter(r => {
    if (!search) return true;
    return getName(r.user_id).toLowerCase().includes(search.toLowerCase());
  });

  const workingCount = records.filter(r => r.status === 'checked_in').length;
  const completedCount = records.filter(r => r.status === 'checked_out').length;
  const totalHours = records.reduce((sum, r) => sum + Number(r.total_worked_minutes || 0), 0) / 60;

  const printEmployeeAttendance = (rec: any) => {
    const name = getName(rec.user_id);
    const email = getEmail(rec.user_id);
    const checkIn = rec.check_in ? formatTimeAZ(rec.check_in) : '-';
    const checkOut = rec.check_out ? formatTimeAZ(rec.check_out) : '-';
    const hoursWorked = (Number(rec.total_worked_minutes || 0) / 60).toFixed(2);
    const breaks = Array.isArray(rec.pauses) ? rec.pauses.length : 0;
    const status = rec.status === 'checked_in' ? 'Working' : rec.status === 'paused' ? 'Paused' : 'Completed';
    const dateStr = formatDateAZ(rec.date);

    const breakRows = Array.isArray(rec.pauses) && rec.pauses.length > 0
      ? rec.pauses.map((p: any, i: number) => {
          const s = formatTimeAZ(p.start);
          const e = p.end ? formatTimeAZ(p.end) : 'Ongoing';
          const dur = p.end ? Math.round((new Date(p.end).getTime() - new Date(p.start).getTime()) / 60000) : '-';
          return `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;">${i + 1}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;">${p.reason || 'Break'}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;">${s}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;">${e}</td><td style="padding:6px 12px;border:1px solid #e5e7eb;">${dur}${typeof dur === 'number' ? ' min' : ''}</td></tr>`;
        }).join('')
      : '';

    const html = `<!DOCTYPE html><html><head><title>Attendance - ${name}</title><style>
      @media print { body { margin: 0; } @page { margin: 20mm; } }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 700px; margin: 0 auto; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
      .company { font-size: 22px; font-weight: 700; color: #2563eb; }
      .subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
      .doc-title { font-size: 13px; font-weight: 600; color: #374151; text-align: right; }
      .doc-date { font-size: 11px; color: #6b7280; text-align: right; }
      .section { margin-bottom: 20px; }
      .section-title { font-size: 13px; font-weight: 600; color: #2563eb; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #f3f4f6; padding: 8px 12px; text-align: left; border: 1px solid #e5e7eb; font-weight: 600; font-size: 12px; color: #374151; }
      td { padding: 6px 12px; border: 1px solid #e5e7eb; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
      .badge-working { background: #dbeafe; color: #2563eb; }
      .badge-completed { background: #dcfce7; color: #16a34a; }
      .badge-paused { background: #fef3c7; color: #d97706; }
      .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
      .big-value { font-size: 28px; font-weight: 700; color: #1a1a1a; }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
      .stat-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
      .stat-label { font-size: 11px; color: #6b7280; }
      .stat-value { font-size: 20px; font-weight: 700; color: #1a1a1a; }
    </style></head><body>
      <div class="header">
        <div><div class="company">My City Radius</div><div class="subtitle">Employee Attendance System</div></div>
        <div><div class="doc-title">Attendance Record</div><div class="doc-date">Printed: ${formatDateShortAZ(new Date())} (AZ)</div></div>
      </div>
      <div class="section">
        <div class="section-title">Employee Information</div>
        <table><tbody>
          <tr><td style="font-weight:600;width:140px;">Full Name</td><td>${name}</td></tr>
          <tr><td style="font-weight:600;">Email</td><td>${email}</td></tr>
          <tr><td style="font-weight:600;">Date</td><td>${dateStr}</td></tr>
          <tr><td style="font-weight:600;">Status</td><td><span class="badge ${status === 'Working' ? 'badge-working' : status === 'Completed' ? 'badge-completed' : 'badge-paused'}">${status}</span></td></tr>
        </tbody></table>
      </div>
      <div class="stats">
        <div class="stat-card"><div class="stat-label">Check In</div><div class="stat-value">${checkIn}</div></div>
        <div class="stat-card"><div class="stat-label">Check Out</div><div class="stat-value">${checkOut}</div></div>
        <div class="stat-card"><div class="stat-label">Hours Worked</div><div class="stat-value">${hoursWorked}h</div></div>
      </div>
      ${breakRows ? `<div class="section"><div class="section-title">Break Details (${breaks})</div><table><thead><tr><th>#</th><th>Reason</th><th>Start</th><th>End</th><th>Duration</th></tr></thead><tbody>${breakRows}</tbody></table></div>` : ''}
      <div class="footer"><span>My City Radius · Attendance Report</span><span>Generated ${formatDateTimeFullAZ(new Date())} (AZ)</span></div>
    </body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => { printWindow.print(); };
    }
  };

  const buildTablePdfHtml = (title: string, subtitle: string, recs: any[], includeEmployee: boolean, summary?: { label: string; value: string }[]) => {
    const rows = recs.map(r => {
      const hours = (Number(r.total_worked_minutes || 0) / 60).toFixed(2);
      const ci = r.check_in ? formatTimeAZ(r.check_in) : '-';
      const co = r.check_out ? formatTimeAZ(r.check_out) : '-';
      const status = r.status === 'checked_in' ? 'Working' : r.status === 'paused' ? 'Paused' : 'Completed';
      const breaks = Array.isArray(r.pauses) ? r.pauses.length : 0;
      const dateStr = formatDateShortAZ(r.date);
      return `<tr>
        ${includeEmployee ? `<td><div style="font-weight:600">${getName(r.user_id)}</div><div style="font-size:10px;color:#64748b">${getEmail(r.user_id)}</div></td>` : ''}
        <td>${dateStr}</td>
        <td>${ci}</td>
        <td>${co}</td>
        <td style="text-align:center">${breaks}</td>
        <td style="text-align:right;font-weight:600">${hours}h</td>
        <td><span class="badge ${status.toLowerCase()}">${status}</span></td>
      </tr>`;
    }).join('');

    const summaryHtml = summary ? `<div class="stats">${summary.map(s => `<div class="stat"><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div></div>`).join('')}</div>` : '';

    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;color:#0f172a;margin:0;padding:40px;background:#fff}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:20px;margin-bottom:24px}
  .brand{font-size:22px;font-weight:800;color:#0d9488;letter-spacing:-0.02em}
  .brand-sub{font-size:11px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.08em}
  .meta{text-align:right;font-size:11px;color:#64748b}
  h1{font-size:22px;margin:0 0 4px}
  .subtitle{color:#64748b;font-size:12px;margin-bottom:20px}
  .stats{display:grid;grid-template-columns:repeat(${summary?.length || 4},1fr);gap:10px;margin-bottom:20px}
  .stat{border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc}
  .stat-label{font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;margin-bottom:4px}
  .stat-value{font-size:18px;font-weight:700;color:#0f172a}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead th{background:#0f172a;color:#fff;text-align:left;padding:9px 10px;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.05em}
  tbody td{padding:8px 10px;border-bottom:1px solid #e2e8f0}
  tbody tr:nth-child(even){background:#f8fafc}
  .badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:600}
  .badge.completed{background:#dcfce7;color:#166534}
  .badge.working{background:#dbeafe;color:#1e40af}
  .badge.paused{background:#fee2e2;color:#991b1b}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;display:flex;justify-content:space-between}
  @media print{body{padding:20px} tr{page-break-inside:avoid}}
</style></head><body>
  <div class="header">
    <div><div class="brand">My City Radius</div><div class="brand-sub">Time & Attendance</div></div>
    <div class="meta"><strong style="color:#0f172a;font-size:13px;display:block;margin-bottom:2px">${title}</strong>Generated ${formatDateTimeFullAZ(new Date())} (AZ)</div>
  </div>
  <h1>${title}</h1>
  <div class="subtitle">${subtitle}</div>
  ${summaryHtml}
  <table>
    <thead><tr>${includeEmployee ? '<th>Employee</th>' : ''}<th>Date</th><th>Check In</th><th>Check Out</th><th style="text-align:center">Breaks</th><th style="text-align:right">Hours</th><th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${includeEmployee ? 7 : 6}" style="text-align:center;padding:24px;color:#94a3b8">No records</td></tr>`}</tbody>
  </table>
  <div class="footer"><span>My City Radius • Confidential</span><span>${recs.length} record${recs.length === 1 ? '' : 's'}</span></div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}</script>
</body></html>`;
  };

  const downloadPDF = () => {
    if (filtered.length === 0) return;
    const totalH = filtered.reduce((s, r) => s + Number(r.total_worked_minutes || 0), 0) / 60;
    const completed = filtered.filter(r => r.status === 'checked_out').length;
    const working = filtered.filter(r => r.status === 'checked_in').length;
    const empLabel = selectedEmployee !== 'all' ? getName(selectedEmployee) : 'All Employees';
    const html = buildTablePdfHtml(
      'Attendance Report',
      `${empLabel} • ${dateFrom} to ${dateTo}`,
      filtered,
      selectedEmployee === 'all',
      [
        { label: 'Records', value: String(filtered.length) },
        { label: 'Completed', value: String(completed) },
        { label: 'Working', value: String(working) },
        { label: 'Total Hours', value: `${totalH.toFixed(1)}h` },
      ],
    );
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(html); w.document.close();
    toast.success('PDF generated');
  };

  const downloadAllBiweeklySheets = async () => {
    toast.loading('Generating per-employee PDFs...', { id: 'biweekly' });

    const { data: allRecords } = await supabase.from('attendance_records').select('*')
      .gte('date', dateFrom).lte('date', dateTo).order('date', { ascending: true });

    if (!allRecords || allRecords.length === 0) {
      toast.dismiss('biweekly');
      toast.info('No records in selected date range');
      return;
    }

    // Group records by employee
    const grouped: Record<string, any[]> = {};
    for (const r of allRecords) {
      if (!grouped[r.user_id]) grouped[r.user_id] = [];
      grouped[r.user_id].push(r);
    }

    const employeeIds = Object.keys(grouped);
    let opened = 0;
    let blocked = 0;

    // Open a separate PDF window for each employee (sequentially with small delay to avoid popup blocker)
    for (const uid of employeeIds) {
      const empRecords = grouped[uid];
      const empName = getName(uid);
      const totalMin = empRecords.reduce((s, r) => s + Number(r.total_worked_minutes || 0), 0);
      const totalH = totalMin / 60;
      const completed = empRecords.filter(r => r.status === 'checked_out').length;
      const breaks = empRecords.reduce((s, r) => s + (Array.isArray(r.pauses) ? r.pauses.length : 0), 0);

      const html = buildTablePdfHtml(
        `Attendance - ${empName}`,
        `${empName} • ${dateFrom} to ${dateTo}`,
        empRecords,
        false,
        [
          { label: 'Records', value: String(empRecords.length) },
          { label: 'Days Worked', value: String(completed) },
          { label: 'Total Hours', value: `${totalH.toFixed(1)}h` },
          { label: 'Total Breaks', value: String(breaks) },
        ],
      );

      const w = window.open('', '_blank', 'width=900,height=700');
      if (!w) { blocked++; continue; }
      w.document.write(html); w.document.close();
      opened++;
      // Small delay so browsers don't block subsequent popups
      await new Promise(res => setTimeout(res, 350));
    }

    toast.dismiss('biweekly');
    if (blocked > 0) {
      toast.warning(`Generated ${opened} PDFs. ${blocked} were blocked - please allow popups for this site.`);
    } else {
      toast.success(`Generated ${opened} PDF${opened === 1 ? '' : 's'} (one per employee)`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/50 bg-gradient-soft p-4 sm:p-5 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">All Attendance</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Default range follows the current biweekly period</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fetchData()}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={downloadPDF} disabled={filtered.length === 0}>
            <Printer className="size-3.5" /> Download PDF
          </Button>
          <Button size="sm" className="gap-1.5 text-xs" onClick={downloadAllBiweeklySheets}>
            <Printer className="size-3.5" /> PDF per Employee
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Users className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Records</p><p className="text-xl font-bold text-foreground">{records.length}</p></div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Clock className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Currently Working</p><p className="text-xl font-bold text-primary">{workingCount}</p></div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><CalendarDays className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-bold text-foreground">{completedCount}</p></div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"><Clock className="size-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Hours</p><p className="text-xl font-bold text-foreground">{totalHours.toFixed(1)}h</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filters</span>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Employee</Label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="h-9"><SelectValue placeholder="All employees" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.user_id} value={emp.user_id}>{emp.full_name || emp.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input placeholder="Search name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Attendance Records ({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="animate-pulse text-primary py-8 text-center">Loading...</div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Breaks</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No records found</TableCell></TableRow>
                  ) : filtered.map(r => (
                    <TableRow key={r.id} className="hover:bg-accent/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {getName(r.user_id).charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-sm block">{getName(r.user_id)}</span>
                            <span className="text-2xs text-muted-foreground">{getEmail(r.user_id)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateShortAZ(r.date).replace(/, \d{4}$/, '')}</TableCell>
                      <TableCell>{r.check_in ? formatTimeAZ(r.check_in) : '-'}</TableCell>
                      <TableCell>{r.check_out ? formatTimeAZ(r.check_out) : '-'}</TableCell>
                      <TableCell>{Array.isArray(r.pauses) ? r.pauses.length : 0}</TableCell>
                      <TableCell className="font-semibold">{(Number(r.total_worked_minutes || 0) / 60).toFixed(1)}h</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'checked_in' ? 'default' : r.status === 'paused' ? 'destructive' : 'secondary'}>
                          {r.status === 'checked_in' ? 'Working' : r.status === 'paused' ? 'Paused' : 'Completed'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => printEmployeeAttendance(r)} title="Print PDF">
                            <Printer className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(r)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteRecord(r)}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editRecord} onOpenChange={(open) => { if (!open) setEditRecord(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Attendance Record</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Check In Time</Label><Input type="time" value={editCheckIn} onChange={e => setEditCheckIn(e.target.value)} /></div>
            <div className="space-y-2"><Label>Check Out Time</Label><Input type="time" value={editCheckOut} onChange={e => setEditCheckOut(e.target.value)} /></div>
            <Button onClick={saveEdit} className="w-full">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAttendance;
