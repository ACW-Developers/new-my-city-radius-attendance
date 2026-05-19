import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Activity, Search, User, Clock } from 'lucide-react';
import { formatDateTimeFullAZ } from '@/lib/timezone';

const ActivityLog = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      setLogs(data || []);

      const { data: p } = await supabase.from('profiles').select('user_id, full_name, email');
      setProfiles(p || []);
      setLoading(false);
    };
    fetchLogs();
  }, [user]);

  const getName = (userId: string) => {
    const p = profiles.find(pr => pr.user_id === userId);
    return p?.full_name || p?.email || userId.slice(0, 8);
  };

  const getActionColor = (action: string) => {
    if (action.includes('check_in')) return 'default';
    if (action.includes('check_out')) return 'secondary';
    if (action.includes('pause')) return 'destructive';
    if (action.includes('resume')) return 'default';
    return 'outline';
  };

  const filteredLogs = logs.filter(log =>
    !search || getName(log.user_id).toLowerCase().includes(search.toLowerCase()) ||
    log.action?.toLowerCase().includes(search.toLowerCase()) ||
    log.details?.toLowerCase().includes(search.toLowerCase())
  );

  const todayCount = logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length;
  const uniqueUsers = new Set(logs.map(l => l.user_id)).size;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-primary text-lg">Loading...</div></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Activity Log</h2>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Activity className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Activities</p>
              <p className="text-xl font-bold text-foreground">{logs.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Today's Actions</p>
              <p className="text-xl font-bold text-foreground">{todayCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <User className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unique Users</p>
              <p className="text-xl font-bold text-foreground">{uniqueUsers}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">All System Activity</CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Search activities..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No activity found</TableCell></TableRow>
                ) : filteredLogs.map(log => (
                  <TableRow key={log.id} className="hover:bg-accent/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {getName(log.user_id).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{getName(log.user_id)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getActionColor(log.action) as any}>
                        {log.action?.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-[250px] truncate">{log.details || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTimeFullAZ(log.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ActivityLog;
