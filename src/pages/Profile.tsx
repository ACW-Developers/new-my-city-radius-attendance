import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { User, Mail, Shield, Save, Camera, Calendar, Briefcase, QrCode, Download, Fingerprint, Trash2, Smartphone } from 'lucide-react';
import { formatDateAZ, formatDateShortAZ } from '@/lib/timezone';
import { QRCodeSVG } from 'qrcode.react';
import { useWebAuthn } from '@/hooks/useWebAuthn';

const Profile = () => {
  const { user, profile, roles, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const { isSupported, register, getCredentials, removeCredential, loading: webauthnLoading } = useWebAuthn();
  const [credentials, setCredentials] = useState<any[]>([]);

  const initials = (profile?.full_name || 'U').split(' ').map(n => n.charAt(0).toUpperCase()).slice(0, 2).join('');
  const badgeCode = (profile as any)?.badge_code || '';

  useEffect(() => {
    if (user) loadCredentials();
  }, [user]);

  const loadCredentials = async () => {
    if (!user) return;
    const creds = await getCredentials(user.id);
    setCredentials(creds);
  };

  const handleRegisterFingerprint = async () => {
    if (!user || !profile) return;
    const success = await register(user.id, profile.full_name || '', profile.email || '');
    if (success) loadCredentials();
  };

  const handleRemoveCredential = async (id: string) => {
    const success = await removeCredential(id);
    if (success) loadCredentials();
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('user_id', profile.user_id);
    setSaving(false);
    if (error) toast.error('Error updating profile');
    else { toast.success('Profile updated'); refreshProfile(); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (uploadError) { toast.error('Upload failed'); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${publicUrl}?t=${Date.now()}`;
    await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('user_id', user.id);
    toast.success('Avatar updated');
    setUploading(false);
    refreshProfile();
  };

  const handleDownloadQR = () => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = 400;
    canvas.width = size;
    canvas.height = size + 60;
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20, size - 40, size - 40);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(badgeCode, size / 2, size + 30);
      const link = document.createElement('a');
      link.download = `qr-code-${badgeCode}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      {/* Hero Card */}
      <Card className="border-border/50 overflow-hidden">
        <div className="relative h-28 bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.15),transparent_60%)]" />
        </div>
        <CardContent className="relative px-6 pb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 -mt-14">
            <div className="relative group shrink-0">
              <Avatar className="h-28 w-28 border-4 border-background shadow-lg">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="bg-primary text-primary-foreground text-3xl font-bold">{initials}</AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={uploading}
              >
                <Camera className="size-7 text-foreground" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
            <div className="flex-1 text-center sm:text-left pb-1">
              <h2 className="text-2xl font-bold text-foreground">{profile?.full_name || 'User'}</h2>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 mt-2">
                {roles.map(r => (
                  <Badge key={r} variant="secondary" className="capitalize text-xs px-2.5">
                    {r.replace('_', ' ')}
                  </Badge>
                ))}
                <Badge variant={profile?.is_active ? 'default' : 'destructive'} className="text-xs px-2.5">
                  {profile?.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <div className="text-center sm:text-right text-xs text-muted-foreground shrink-0">
              <div className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                <span>Joined {(profile as any)?.created_at ? formatDateAZ((profile as any).created_at) : 'N/A'}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Info */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-5 text-primary" /> Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><Mail className="size-3.5 text-muted-foreground" /> Email</Label>
              <Input value={profile?.email || ''} disabled className="bg-muted/50 h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><User className="size-3.5 text-muted-foreground" /> Full Name</Label>
              <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Enter your full name" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><Shield className="size-3.5 text-muted-foreground" /> Roles</Label>
              <Input value={roles.length > 0 ? roles.map(r => r.replace('_', ' ')).join(', ') : 'Unassigned'} disabled className="bg-muted/50 capitalize h-9 text-sm" />
            </div>
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 w-full">
              <Save className="size-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="size-5 text-primary" /> My QR Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Show this QR code to the admin scanner for quick check-in/out.
            </p>
            {badgeCode ? (
              <div className="flex flex-col items-center gap-3">
                <div ref={qrRef} className="rounded-xl border-2 border-border bg-white p-4 shadow-sm">
                  <QRCodeSVG value={`MCR:${user?.id}:${badgeCode}`} size={140} bgColor="#ffffff" fgColor="#000000" level="H" />
                </div>
                <p className="font-mono text-sm font-bold tracking-[0.3em] text-foreground">{badgeCode}</p>
                <Button onClick={handleDownloadQR} variant="outline" size="sm" className="gap-1.5 text-xs w-full">
                  <Download className="size-3.5" /> Download QR Code
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
                <QrCode className="mx-auto size-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">QR code will be generated automatically.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fingerprint Authentication */}
        <Card className="border-border/50 md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="size-5 text-primary" /> Fingerprint Authentication
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Register your device fingerprint for quick biometric check-in and check-out.
            </p>

            {!isSupported() ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                <Fingerprint className="mx-auto size-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Biometric authentication is not supported on this device.</p>
                <p className="text-xs text-muted-foreground mt-1">Try using Chrome on Android or Safari on iOS.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {credentials.length > 0 && (
                  <div className="space-y-2">
                    {credentials.map((cred: any) => (
                      <div key={cred.id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 bg-muted/10">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <Smartphone className="size-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{cred.device_name || 'Unknown Device'}</p>
                            <p className="text-xs text-muted-foreground">Registered {formatDateShortAZ(cred.created_at)}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemoveCredential(cred.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button onClick={handleRegisterFingerprint} disabled={webauthnLoading} variant="outline" className="gap-2 w-full sm:w-auto">
                  <Fingerprint className="size-4" />
                  {webauthnLoading ? 'Registering...' : credentials.length > 0 ? 'Register Another Device' : 'Register Fingerprint'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
