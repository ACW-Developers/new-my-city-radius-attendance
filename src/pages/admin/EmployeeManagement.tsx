import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Users, Search, UserPlus, Pencil, Trash2, Shield } from 'lucide-react';
import { roleLabel } from '@/lib/roleLabels';

const ROLES = ['admin', 'caregiver', 'it_support', 'driver', 'manager'] as const;

const EmployeeManagement = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [editName, setEditName] = useState('');

  const fetchEmployees = async () => {
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at');
    const { data: roles } = await supabase.from('user_roles').select('*');
    const merged = (profiles || []).map(p => ({
      ...p,
      roles: (roles || []).filter((r: any) => r.user_id === p.user_id).map((r: any) => r.role),
    }));
    setEmployees(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchEmployees();
    const channel = supabase
      .channel('employee-management-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchEmployees())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_roles' }, () => fetchEmployees())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const logActivity = async (action: string, details?: string) => {
    if (!user) return;
    await supabase.from('activity_logs').insert({ user_id: user.id, action, details });
  };

  const assignRole = async (userId: string, role: string) => {
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: role as any });
    if (error) toast.error('Error assigning role');
    else { toast.success('Role assigned'); await logActivity('assign_role', `Assigned ${role} to user`); fetchEmployees(); }
  };

  const removeRole = async (userId: string, role: string) => {
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role as any);
    if (error) toast.error('Error removing role');
    else { toast.success('Role removed'); await logActivity('remove_role', `Removed ${role} from user`); fetchEmployees(); }
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    const { error } = await supabase.from('profiles').update({ is_active: !isActive }).eq('user_id', userId);
    if (error) toast.error('Error updating status');
    else { toast.success('Status updated'); await logActivity('toggle_active', `Set user ${isActive ? 'inactive' : 'active'}`); fetchEmployees(); }
  };

  const updateName = async () => {
    if (!editingEmployee) return;
    const { error } = await supabase.from('profiles').update({ full_name: editName }).eq('user_id', editingEmployee.user_id);
    if (error) toast.error('Error updating');
    else { toast.success('Name updated'); await logActivity('update_profile', `Updated name to ${editName}`); setEditingEmployee(null); fetchEmployees(); }
  };

  const deleteEmployee = async (emp: any) => {
    if (!confirm(`Are you sure you want to deactivate ${emp.full_name || emp.email}?`)) return;
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('user_id', emp.user_id);
    if (error) toast.error('Error deactivating');
    else { toast.success('Employee deactivated'); await logActivity('deactivate_employee', `Deactivated ${emp.full_name || emp.email}`); fetchEmployees(); }
  };

  const filtered = employees.filter(e =>
    !search || e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.email?.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = employees.filter(e => e.is_active).length;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-pulse text-primary text-lg">Loading...</div></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl font-bold text-foreground">Employee Management</h2>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1"><Users className="size-3" /> {employees.length} total</Badge>
          <Badge variant="default" className="gap-1"><Shield className="size-3" /> {activeCount} active</Badge>
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">All Employees</CardTitle>
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
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Assign Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow key={emp.id} className="hover:bg-accent/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {(emp.full_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{emp.full_name || 'N/A'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{emp.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {emp.roles.map((role: string) => (
                          <Badge key={role} variant="secondary" className="cursor-pointer text-xs" onClick={() => removeRole(emp.user_id, role)}>
                            {roleLabel(role)} ×
                          </Badge>
                        ))}
                        {emp.roles.length === 0 && <span className="text-xs text-muted-foreground italic">Unassigned</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select onValueChange={(v) => assignRole(emp.user_id, v)}>
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue placeholder="Add role" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.filter(r => !emp.roles.includes(r)).map(r => (
                            <SelectItem key={r} value={r} className="text-xs">{roleLabel(r)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch checked={emp.is_active} onCheckedChange={() => toggleActive(emp.user_id, emp.is_active)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingEmployee(emp); setEditName(emp.full_name || ''); }}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteEmployee(emp)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingEmployee} onOpenChange={(open) => { if (!open) setEditingEmployee(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <Button onClick={updateName} className="w-full">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeManagement;
