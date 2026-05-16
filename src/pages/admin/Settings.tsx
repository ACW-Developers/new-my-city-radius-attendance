import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Settings as SettingsIcon, Shield, Database, Globe, Palette, Eye, EyeOff,
  Save, Download, Upload, RefreshCw, Monitor, Moon, Sun, Server, ToggleLeft, CalendarRange,
} from 'lucide-react';
import { getBiweeklyPeriod, formatPeriodLabel } from '@/lib/biweekly';

interface ModuleVisibility {
  dashboard: boolean; checkin: boolean; attendance: boolean; pay: boolean;
  employees: boolean; pay_rates: boolean; admin_attendance: boolean;
  payroll: boolean; reports: boolean; activity_log: boolean; settings: boolean;
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', checkin: 'Check In', attendance: 'Attendance History',
  pay: 'Pay & Hours', employees: 'Employee Management', pay_rates: 'Pay Rate Management',
  admin_attendance: 'Admin Attendance', payroll: 'Payroll', reports: 'Reports',
  activity_log: 'Activity Log', settings: 'Settings',
};

const Settings = () => {
  const { isDark, toggleTheme } = useTheme();
  const [appName, setAppName] = useState('My City Radius');
  const [modules, setModules] = useState<ModuleVisibility>({
    dashboard: true, checkin: true, attendance: true, pay: true,
    employees: true, pay_rates: true, admin_attendance: true,
    payroll: true, reports: true, activity_log: true, settings: true,
  });
  const [workStart, setWorkStart] = useState('08:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [payPeriod, setPayPeriod] = useState('biweekly');
  const [biweeklyAnchor, setBiweeklyAnchor] = useState(() => new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('system_settings' as any).select('key, value');
      if (data) {
        for (const row of data as any[]) {
          if (row.key === 'app_name') setAppName(typeof row.value === 'string' ? row.value : String(row.value));
          if (row.key === 'modules') setModules(prev => ({ ...prev, ...(typeof row.value === 'object' ? row.value : {}) }));
          if (row.key === 'work_hours' && typeof row.value === 'object') {
            setWorkStart(row.value.start || '08:00');
            setWorkEnd(row.value.end || '17:00');
          }
          if (row.key === 'pay_period') setPayPeriod(typeof row.value === 'string' ? row.value : String(row.value));
          if (row.key === 'biweekly_anchor') setBiweeklyAnchor(typeof row.value === 'string' ? row.value : String(row.value));
        }
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { key: 'app_name', value: appName },
        { key: 'modules', value: modules },
        { key: 'work_hours', value: { start: workStart, end: workEnd, timezone: 'America/Phoenix' } },
        { key: 'pay_period', value: payPeriod },
        { key: 'biweekly_anchor', value: biweeklyAnchor },
      ];
      for (const u of updates) {
        const { data: existing } = await supabase.from('system_settings' as any).select('id').eq('key', u.key).maybeSingle();
        if (existing) {
          await (supabase.from('system_settings' as any) as any).update({ value: u.value, updated_at: new Date().toISOString() }).eq('key', u.key);
        } else {
          await (supabase.from('system_settings' as any) as any).insert({ key: u.key, value: u.value });
        }
      }
      toast.success('Settings saved successfully');
    } catch {
      toast.error('Error saving settings');
    }
    setSaving(false);
  };

  const handleExportData = async () => {
    toast.info('Preparing data export...');
    const tables = ['profiles', 'attendance_records', 'pay_rates', 'activity_logs', 'user_roles'] as const;
    const exportData: Record<string, any> = {};
    for (const t of tables) {
      const { data } = await supabase.from(t).select('*');
      exportData[t] = data || [];
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mycity-radius-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported successfully');
  };

  const toggleModule = (key: string) => {
    setModules(prev => ({ ...prev, [key]: !prev[key as keyof ModuleVisibility] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">System Settings</h2>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="size-4" /> {saving ? 'Saving...' : 'Save All'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General Settings */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <SettingsIcon className="size-5 text-primary" />
            </div>
            <CardTitle className="text-base">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Application Name</Label>
              <Input value={appName} onChange={e => setAppName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Work Start</Label>
                <Input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Work End</Label>
                <Input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Pay Period</Label>
              <Input value={payPeriod} onChange={e => setPayPeriod(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Biweekly Period */}
        <Card className="border-border/50 lg:col-span-2 bg-gradient-to-br from-card to-accent/30">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <CalendarRange className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">Biweekly Period</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Set the start date of your first biweekly period. The system advances every 14 days automatically.
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>First Period Start Date</Label>
              <Input type="date" value={biweeklyAnchor} onChange={e => setBiweeklyAnchor(e.target.value)} />
              <p className="text-2xs text-muted-foreground">All payroll, pay summaries, and reports filter from this anchor.</p>
            </div>
            <div className="space-y-2">
              <Label>Current Period</Label>
              <div className="flex h-10 items-center rounded-md border border-border/60 bg-background px-3">
                <Badge variant="secondary" className="font-mono text-xs">
                  {formatPeriodLabel(getBiweeklyPeriod(biweeklyAnchor))}
                </Badge>
              </div>
              <p className="text-2xs text-muted-foreground">Period #{getBiweeklyPeriod(biweeklyAnchor).index + 1} since anchor.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Palette className="size-5 text-primary" />
            </div>
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div className="flex items-center gap-3">
                {isDark ? <Moon className="size-5 text-primary" /> : <Sun className="size-5 text-primary" />}
                <div>
                  <p className="text-sm font-medium text-foreground">Theme</p>
                  <p className="text-xs text-muted-foreground">{isDark ? 'Dark Mode' : 'Light Mode'}</p>
                </div>
              </div>
              <Switch checked={isDark} onCheckedChange={toggleTheme} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Timezone</p>
                  <p className="text-xs text-muted-foreground">America/Phoenix (Arizona)</p>
                </div>
              </div>
              <Badge variant="secondary">MST</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Module Visibility */}
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ToggleLeft className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Module Visibility</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Toggle modules on/off to control what's visible in the sidebar</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(MODULE_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div className="flex items-center gap-2">
                    {modules[key as keyof ModuleVisibility] ? <Eye className="size-4 text-primary" /> : <EyeOff className="size-4 text-muted-foreground" />}
                    <span className="text-sm font-medium text-foreground">{label}</span>
                  </div>
                  <Switch
                    checked={modules[key as keyof ModuleVisibility]}
                    onCheckedChange={() => toggleModule(key)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Data & Backup */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Database className="size-5 text-primary" />
            </div>
            <CardTitle className="text-base">Data & Backup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleExportData} variant="outline" className="w-full gap-2">
              <Download className="size-4" /> Export All Data (JSON)
            </Button>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Database</span><Badge variant="default">Cloud</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Activity Logging</span><Badge variant="default">Enabled</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Auto Backups</span><Badge variant="secondary">Automatic</Badge></div>
            </div>
          </CardContent>
        </Card>

        {/* Security & Infrastructure */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="size-5 text-primary" />
            </div>
            <CardTitle className="text-base">Security & Infrastructure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Authentication</span><Badge variant="default">Email + Password</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Row Level Security</span><Badge variant="default">Enabled</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Auto Admin (1st User)</span><Badge variant="default">Active</Badge></div>
            <Separator className="my-2" />
            <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><Badge variant="default">Lovable Cloud</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="default">Operational</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Version</span><Badge variant="secondary">1.0.0</Badge></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
