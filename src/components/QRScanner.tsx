import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff, SwitchCamera, RefreshCw, Usb, Bluetooth, Keyboard, CheckCircle2, XCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

interface QRScannerProps {
  onScan: (data: string) => void;
  scanning: boolean;
  /** Show external device picker (camera + USB/Bluetooth pairing). */
  allowDeviceSelection?: boolean;
}

type PairedDevice = { id: string; name: string; kind: 'hid' | 'bluetooth' };

export function QRScanner({ onScan, scanning, allowDeviceSelection = false }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [mode, setMode] = useState<'camera' | 'hid'>('camera');
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [hidListening, setHidListening] = useState(false);
  const lastScanRef = useRef('');
  const lastScanTimeRef = useRef(0);
  const hidBufferRef = useRef('');
  const hidLastKeyTimeRef = useRef(0);

  const emitScan = useCallback((value: string) => {
    if (!value) return;
    const now = Date.now();
    if (value !== lastScanRef.current || now - lastScanTimeRef.current > 1500) {
      lastScanRef.current = value;
      lastScanTimeRef.current = now;
      onScan(value);
    }
  }, [onScan]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    setActive(false);
  }, []);

  const enumerateCameras = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter(d => d.kind === 'videoinput'));
    } catch (err) {
      console.error('enumerateDevices error', err);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError('');
    try {
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      if (allowDeviceSelection) await enumerateCameras();
    } catch (err: any) {
      setError('Camera access denied or device unavailable.');
      console.error('Camera error:', err);
    }
  }, [facingMode, selectedDeviceId, allowDeviceSelection, enumerateCameras]);

  const toggleFacing = useCallback(() => {
    stopCamera();
    setSelectedDeviceId('');
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, [stopCamera]);

  // Camera lifecycle
  useEffect(() => {
    if (scanning && mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [scanning, mode, facingMode, selectedDeviceId]);

  // Camera scan loop
  useEffect(() => {
    if (!active || !scanning || mode !== 'camera') return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const hasBarcodeDetector = 'BarcodeDetector' in window;
    let detector: any = null;
    if (hasBarcodeDetector) {
      detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
    }

    const scan = async () => {
      if (!video.videoWidth || !video.videoHeight) {
        animFrameRef.current = requestAnimationFrame(scan);
        return;
      }
      if (detector) {
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) emitScan(barcodes[0].rawValue);
        } catch {}
      }
      animFrameRef.current = requestAnimationFrame(scan);
    };
    animFrameRef.current = requestAnimationFrame(scan);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [active, scanning, mode, emitScan]);

  // HID keyboard-wedge listener: most USB/Bluetooth scanners type chars + Enter.
  useEffect(() => {
    if (!scanning || mode !== 'hid') return;
    setHidListening(true);

    const onKey = (e: KeyboardEvent) => {
      // Ignore typing in inputs/textareas
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      const now = Date.now();
      // Reset buffer if pause between keys is too long (>120ms = human typing)
      if (now - hidLastKeyTimeRef.current > 120 && hidBufferRef.current.length > 0) {
        hidBufferRef.current = '';
      }
      hidLastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const value = hidBufferRef.current.trim();
        hidBufferRef.current = '';
        if (value.length >= 3) {
          e.preventDefault();
          emitScan(value);
        }
      } else if (e.key.length === 1) {
        hidBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      setHidListening(false);
      hidBufferRef.current = '';
    };
  }, [scanning, mode, emitScan]);

  // Load already-paired WebHID devices on mount
  useEffect(() => {
    if (!allowDeviceSelection) return;
    const nav: any = navigator;
    if (nav.hid?.getDevices) {
      nav.hid.getDevices().then((ds: any[]) => {
        const list: PairedDevice[] = ds.map(d => ({
          id: `${d.vendorId}:${d.productId}`,
          name: d.productName || `HID ${d.vendorId}:${d.productId}`,
          kind: 'hid' as const,
        }));
        setPairedDevices(prev => [...prev.filter(p => p.kind !== 'hid'), ...list]);
      }).catch(() => {});
    }
  }, [allowDeviceSelection]);

  // Listen to HID device data and emit scans (for non keyboard-emulating scanners)
  const attachHidListener = useCallback(async (device: any) => {
    try {
      if (!device.opened) await device.open();
      let buf = '';
      let lastT = 0;
      device.addEventListener('inputreport', (event: any) => {
        const data: DataView = event.data;
        let chunk = '';
        for (let i = 0; i < data.byteLength; i++) {
          const b = data.getUint8(i);
          if (b >= 32 && b < 127) chunk += String.fromCharCode(b);
          else if (b === 13 || b === 10) chunk += '\n';
        }
        const now = Date.now();
        if (now - lastT > 200) buf = '';
        lastT = now;
        buf += chunk;
        if (buf.includes('\n')) {
          const value = buf.split('\n')[0].trim();
          buf = '';
          if (value.length >= 3) emitScan(value);
        }
      });
    } catch (err) {
      console.error('HID listen error', err);
    }
  }, [emitScan]);

  const pairUSB = useCallback(async () => {
    const nav: any = navigator;
    if (!nav.hid?.requestDevice) {
      toast({ title: 'Not supported', description: 'WebHID is unavailable. Use Chrome/Edge on desktop.', variant: 'destructive' });
      return;
    }
    try {
      const ds = await nav.hid.requestDevice({ filters: [] });
      if (!ds || ds.length === 0) return;
      const added: PairedDevice[] = [];
      for (const d of ds) {
        added.push({ id: `${d.vendorId}:${d.productId}`, name: d.productName || `HID ${d.vendorId}:${d.productId}`, kind: 'hid' });
        attachHidListener(d);
      }
      setPairedDevices(prev => {
        const ids = new Set(prev.map(p => p.id));
        return [...prev, ...added.filter(a => !ids.has(a.id))];
      });
      toast({ title: 'USB device paired', description: `${added.length} device(s) connected.` });
      setMode('hid');
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Pairing cancelled', description: err?.message || 'No device selected.' });
    }
  }, [attachHidListener]);

  const pairBluetooth = useCallback(async () => {
    const nav: any = navigator;
    if (!nav.bluetooth?.requestDevice) {
      toast({ title: 'Not supported', description: 'Web Bluetooth is unavailable. Use Chrome/Edge on desktop or Android.', variant: 'destructive' });
      return;
    }
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', '0000180f-0000-1000-8000-00805f9b34fb'],
      });
      if (!device) return;
      try { await device.gatt?.connect(); } catch {}
      setPairedDevices(prev => {
        const id = device.id || device.name || Math.random().toString(36);
        if (prev.some(p => p.id === id)) return prev;
        return [...prev, { id, name: device.name || 'Bluetooth Scanner', kind: 'bluetooth' }];
      });
      toast({
        title: 'Bluetooth device paired',
        description: `${device.name || 'Device'} connected. If it acts as a keyboard, switch to HID mode to receive scans.`
      });
      setMode('hid');
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Pairing cancelled', description: err?.message || 'No device selected.' });
    }
  }, []);

  const removePaired = (id: string) => setPairedDevices(prev => prev.filter(p => p.id !== id));

  if (!scanning) return null;

  const hidSupported = typeof navigator !== 'undefined' && !!(navigator as any).hid;
  const bleSupported = typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-[340px]">
      {allowDeviceSelection && (
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'camera' | 'hid')} className="w-full">
          <TabsList className="grid grid-cols-2 w-full h-9">
            <TabsTrigger value="camera" className="text-xs gap-1.5"><Camera className="size-3.5" /> Camera</TabsTrigger>
            <TabsTrigger value="hid" className="text-xs gap-1.5"><Keyboard className="size-3.5" /> USB / BT</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {mode === 'camera' && (
        <div className="relative w-full aspect-square rounded-xl overflow-hidden border-2 border-primary/30 bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          {active && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-md" />
              <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-md" />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-md" />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-md" />
              <div className="absolute left-4 right-4 top-1/2 h-0.5 bg-primary/60 animate-pulse" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
              <div className="text-center">
                <CameraOff className="mx-auto size-8 text-destructive mb-2" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'hid' && (
        <div className="w-full rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-4 flex flex-col items-center gap-3 min-h-[200px] justify-center">
          <div className={`flex size-14 items-center justify-center rounded-full ${hidListening ? 'bg-primary/20 animate-pulse' : 'bg-muted'}`}>
            <Keyboard className="size-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-foreground">
              {hidListening ? 'Listening for scanner input…' : 'HID scanner mode'}
            </p>
            <p className="text-2xs text-muted-foreground mt-1 max-w-[260px]">
              Plug in your USB barcode scanner or pair a Bluetooth one. Scan a code - it will be received automatically.
            </p>
          </div>
          {pairedDevices.length > 0 && (
            <div className="w-full space-y-1 mt-1">
              {pairedDevices.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-md px-2 py-1 bg-background/70 border border-border/40">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {d.kind === 'hid' ? <Usb className="size-3 text-primary shrink-0" /> : <Bluetooth className="size-3 text-accent-blue shrink-0" />}
                    <span className="text-2xs truncate">{d.name}</span>
                  </div>
                  <button onClick={() => removePaired(d.id)} className="text-muted-foreground hover:text-destructive">
                    <XCircle className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'camera' && (
        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={toggleFacing}>
            <SwitchCamera className="size-3.5" /> Flip Camera
          </Button>
          {allowDeviceSelection && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={enumerateCameras}>
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
          )}
        </div>
      )}

      {allowDeviceSelection && (
        <div className="w-full flex flex-wrap gap-2 justify-center">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={pairUSB} disabled={!hidSupported}>
            <Usb className="size-3.5" /> Pair USB
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={pairBluetooth} disabled={!bleSupported}>
            <Bluetooth className="size-3.5" /> Pair Bluetooth
          </Button>
        </div>
      )}

      {allowDeviceSelection && mode === 'camera' && devices.length > 0 && (
        <div className="w-full">
          <Select value={selectedDeviceId || '__default__'} onValueChange={(v) => setSelectedDeviceId(v === '__default__' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose camera" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__" className="text-xs">Built-in (auto)</SelectItem>
              {devices.map(d => (
                <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                  {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {allowDeviceSelection && (!hidSupported || !bleSupported) && (
        <p className="text-2xs text-muted-foreground text-center">
          {!hidSupported && 'WebHID '}{!hidSupported && !bleSupported && '& '}{!bleSupported && 'Web Bluetooth '}
          require Chrome/Edge on desktop (or Android for Bluetooth).
        </p>
      )}

      {mode === 'camera' && !('BarcodeDetector' in window) && (
        <p className="text-2xs text-muted-foreground text-center">
          Your browser doesn't support automatic QR scanning. Use Chrome on Android or Safari 16.4+ on iOS.
        </p>
      )}
    </div>
  );
}
