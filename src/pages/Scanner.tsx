import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Camera, CheckCircle2, Square, ScanLine } from 'lucide-react';
import { QRScanner } from '@/components/QRScanner';
import { formatTimeAZ } from '@/lib/timezone';
import { verifyAttendanceLocation } from '@/lib/geofence';

const Scanner = () => {
  const [active, setActive] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; action: string; time: string }>>([]);

  const onScan = async (data: string) => {
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
        setResults(prev => [{ name, action: 'Checked In', time: timeStr }, ...prev]);
        toast.success(`✅ ${name} checked in`);
      } else if (r.action === 'checked_out') {
        const hrs = ((r.worked_minutes || 0) / 60).toFixed(1);
        setResults(prev => [{ name, action: 'Checked Out', time: timeStr }, ...prev]);
        toast.success(`✅ ${name} checked out (${hrs}h)`);
      } else if (r.action === 'cooldown') {
        setResults(prev => [{ name, action: `Wait ${r.wait_minutes}m`, time: timeStr }, ...prev]);
        toast.info(`${name}: wait ${r.wait_minutes}m before scanning again`);
      } else if (r.action === 'already_completed') {
        setResults(prev => [{ name, action: 'Already Done', time: timeStr }, ...prev]);
        toast.info(`${name} already completed their shift`);
      }
    } catch {
      toast.error('Network error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" />
            <div>
              <h1 className="text-lg font-semibold">Attendance Scanner</h1>
              <p className="text-2xs text-muted-foreground">Standalone session - keeps running without admin login</p>
            </div>
          </div>
          <Badge variant={active ? 'default' : 'secondary'} className="text-2xs">
            {active ? 'Live' : 'Idle'}
          </Badge>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1.5">
              <Camera className="size-3.5 text-primary" /> QR Scanner
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!active ? (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
                  <Camera className="size-8 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-md">
                  Start the standalone scanning session. Workers can scan their QR codes one by one. The session will keep running even if you close the admin login.
                </p>
                <Button onClick={() => { setActive(true); setResults([]); }} size="sm" className="gap-1.5 rounded-full px-6 text-xs">
                  <Camera className="size-3.5" /> Start Scanning
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <div className="shrink-0">
                    <QRScanner onScan={onScan} scanning={active} allowDeviceSelection />
                  </div>
                  <div className="flex-1 w-full">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium">Scan Log</h4>
                      <Badge variant="default" className="text-2xs animate-pulse">Live</Badge>
                    </div>
                    <div className="max-h-72 overflow-y-auto space-y-1.5 rounded-lg border border-border/50 p-2 bg-muted/10">
                      {results.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Waiting for workers to scan...</p>
                      ) : results.map((r, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md px-2.5 py-1.5 bg-background border border-border/30">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className={`size-3.5 ${r.action === 'Checked In' ? 'text-primary' : r.action === 'Checked Out' ? 'text-destructive' : 'text-muted-foreground'}`} />
                            <span className="text-xs font-medium">{r.name}</span>
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
                    <p className="text-2xs text-muted-foreground mt-2">{results.length} scan(s)</p>
                  </div>
                </div>
                <Button onClick={() => setActive(false)} variant="destructive" size="sm" className="gap-1.5 text-xs w-full">
                  <Square className="size-3" /> Stop Scanner
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Scanner;
