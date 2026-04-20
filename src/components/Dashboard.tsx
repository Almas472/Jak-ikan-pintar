import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Clock, 
  Settings, 
  Activity, 
  Droplets, 
  Thermometer, 
  History,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  Battery,
  Settings2,
  User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { PondStatus, FeedingSchedule, FeedingLog } from '../types';
import { getFeedingRecommendation } from '../services/geminiService';
import { cn } from '@/lib/utils';
import { db, auth } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  limit, 
  Timestamp,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

type TabType = 'overview' | 'schedule' | 'sensors' | 'history' | 'settings';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [ponds, setPonds] = useState<PondStatus[]>([]);
  const [selectedPondId, setSelectedPondId] = useState<string>('');
  const [recommendation, setRecommendation] = useState<any>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [logs, setLogs] = useState<FeedingLog[]>([]);
  const [user, setUser] = useState<any>(null);

  // Auth setup
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        signInAnonymously(auth);
      }
    });
    return unsub;
  }, []);

  // Initialize data if none exists
  const initializePond = async () => {
    if (!user) return;
    const pondRef = doc(db, 'ponds', 'default-pond');
    const snap = await getDoc(pondRef);
    if (!snap.exists()) {
      const initialPond: any = {
        name: 'Unit Bioflok B-04',
        type: 'biofloc',
        fishCount: 1000,
        fishAge: 45,
        feedLevel: 78,
        temperature: 28.4,
        ph: 7.2,
        battery: 92,
        lastFeeding: new Date().toISOString(),
        updatedAt: Timestamp.now()
      };
      await setDoc(pondRef, initialPond);
      
      // Default schedules
      const schedulesRef = collection(pondRef, 'schedules');
      const defaultSchedules = [
        { time: '07:00', amount: 400, enabled: true },
        { time: '13:00', amount: 400, enabled: true },
        { time: '19:00', amount: 600, enabled: true },
        { time: '23:00', amount: 200, enabled: true },
      ];
      for (const s of defaultSchedules) {
        await addDoc(schedulesRef, s);
      }
    }
  };

  useEffect(() => {
    if (user) {
      initializePond();
    }
  }, [user]);

  // Sync Ponds
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'ponds'), (snap) => {
      const pondList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PondStatus));
      setPonds(pondList);
      if (pondList.length > 0 && !selectedPondId) {
        setSelectedPondId(pondList[0].id);
      }
    });
    return unsub;
  }, [user, selectedPondId]);

  // Sync Selected Pond Schedules
  const [selectedSchedules, setSelectedSchedules] = useState<FeedingSchedule[]>([]);
  useEffect(() => {
    if (!selectedPondId) return;
    const unsub = onSnapshot(collection(db, 'ponds', selectedPondId, 'schedules'), (snap) => {
      const scheduleList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedingSchedule));
      setSelectedSchedules(scheduleList.sort((a, b) => a.time.localeCompare(b.time)));
    });
    return unsub;
  }, [selectedPondId]);

  // Sync Logs
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'feeding_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedingLog)));
    });
    return unsub;
  }, [user]);

  const selectedPond = ponds.find(p => p.id === selectedPondId);

  const handleManualFeed = async (amount: number = 200) => {
    if (!selectedPondId) return;
    
    const feedToast = toast.loading(`Mengirim instruksi pakan ke ${selectedPond?.name}...`);
    
    try {
      // Simulate hardware response delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update last feeding
      await updateDoc(doc(db, 'ponds', selectedPondId), {
        lastFeeding: new Date().toISOString(),
        feedLevel: Math.max(0, (selectedPond?.feedLevel || 0) - 2)
      });

      // Add log
      await addDoc(collection(db, 'feeding_logs'), {
        pondId: selectedPondId,
        timestamp: new Date().toISOString(),
        amount: amount,
        status: 'success'
      });

      toast.success("Pakan Berhasil Dikeluarkan", { id: feedToast });
    } catch (error) {
      toast.error("Gagal Mengeluarkan Pakan", { id: feedToast });
    }
  };

  const toggleSchedule = async (scheduleId: string, currentState: boolean) => {
    await updateDoc(doc(db, 'ponds', selectedPondId, 'schedules', scheduleId), {
      enabled: !currentState
    });
    toast.info(`Jadwal ${!currentState ? 'Diaktifkan' : 'Dinonaktifkan'}`);
  };

  const fetchAIAdvice = async () => {
    if (!selectedPond) return;
    setIsLoadingAI(true);
    const advice = await getFeedingRecommendation(selectedPond);
    setRecommendation(advice);
    setIsLoadingAI(false);
  };

  const calibrateSensor = () => {
    toast.promise(new Promise(resolve => setTimeout(resolve, 2000)), {
      loading: 'Mengkalibrasi sensor...',
      success: 'Sensor berhasil dikalibrasi ke titik nol.',
      error: 'Sensor gagal dikalibrasi.',
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#060c0c] text-white">
        <Activity className="w-12 h-12 text-[#00f2ea] animate-pulse mb-4" />
        <p className="text-white/60 tracking-widest uppercase text-xs">Menghubungkan ke Sistem...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex p-6 gap-6 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 glass rounded-[30px] p-8 flex flex-col shrink-0">
        <div className="text-2xl font-extrabold tracking-tighter text-[#00f2ea] mb-16 flex items-center gap-2">
          <Activity className="w-6 h-6" /> SiluroFeed.
        </div>
        <nav className="flex flex-col gap-2">
          {[
            { id: 'overview', label: 'Ringkasan Kolam', icon: Activity },
            { id: 'schedule', label: 'Penjadwalan', icon: Clock },
            { id: 'sensors', label: 'Data Sensor', icon: Droplets },
            { id: 'history', label: 'Riwayat Makan', icon: History },
            { id: 'settings', label: 'Pengaturan Alat', icon: Settings2 },
          ].map((item) => (
            <div 
              key={item.id}
              onClick={() => setActiveTab(item.id as TabType)}
              className={cn(
                "flex items-center gap-3 py-3 px-1 text-sm transition-all cursor-pointer border-b border-transparent",
                activeTab === item.id 
                  ? "text-white border-[#00f2ea] font-semibold" 
                  : "text-white/40 hover:text-white"
              )}
            >
              <item.icon className={cn("w-4 h-4", activeTab === item.id ? "text-[#00f2ea]" : "")} />
              {item.label}
            </div>
          ))}
        </nav>
        <div className="mt-auto pt-8 flex flex-col gap-4">
          <div className="p-3 bg-white/5 rounded-2xl flex items-center gap-3 border border-white/10">
            <div className="w-8 h-8 rounded-full bg-[#00f2ea22] flex items-center justify-center text-[#00f2ea]">
              <User className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[10px] text-white/40 uppercase tracking-wider truncate">Operator</p>
              <p className="text-xs font-bold truncate">Admin Siluro</p>
            </div>
          </div>
          <p className="opacity-30 text-[10px] tracking-widest uppercase">v2.1 Stable Connection</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pr-2">
        {selectedPond ? (
          <div className="flex flex-col gap-6 pb-12">
            {/* Header */}
            <div className="flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-light text-white">{selectedPond.name}</h1>
                <div className="inline-block px-2.5 py-1 bg-white/10 rounded-md text-[10px] font-bold tracking-wider uppercase mt-2">
                  TIPE: {selectedPond.type === 'biofloc' ? 'KOLAM BUNDAR BIOFLOK' : 'KOLAM KONVENSIONAL'}
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={selectedPondId} onValueChange={setSelectedPondId}>
                  <SelectTrigger className="w-[180px] glass h-10 border-white/20 text-white rounded-xl">
                    <SelectValue placeholder="Pilih Kolam" />
                  </SelectTrigger>
                  <SelectContent className="glass-dark border-white/20 text-white">
                    {ponds.map(p => (
                      <SelectItem key={p.id} value={p.id} className="hover:bg-white/10">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="bg-[#00f2ea1a] border border-[#00f2ea] text-[#00f2ea] px-4 py-1.5 h-10 flex items-center rounded-xl text-[10px] font-bold tracking-widest uppercase">
                  Sistem Online
                </div>
              </div>
            </div>

            {/* Content Screens */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-3 gap-5">
                <div className="col-span-2 glass rounded-[24px] p-6 flex items-center justify-between bg-linear-to-br from-[#00f2ea1a] to-white/5">
                  <div className="space-y-1">
                    <p className="text-xs text-white/60 uppercase tracking-widest">Stok Pakan Saat Ini</p>
                    <h2 className="text-5xl font-bold">{((selectedPond.feedLevel / 100) * 15).toFixed(1)} <span className="text-2xl font-normal opacity-60">Kg</span></h2>
                    <p className="text-xs text-white/60">Cukup untuk ± {Math.floor((selectedPond.feedLevel / 100) * 5)} hari kedepan</p>
                  </div>
                  <div className="w-32 h-32 rounded-full border-8 border-white/10 flex items-center justify-center relative">
                    <div className="absolute inset-[-8px] rounded-full border-8 border-[#00f2ea] border-b-transparent border-l-transparent" 
                      style={{ transform: `rotate(${(selectedPond.feedLevel / 100) * 360}deg)` }}
                    />
                    <div className="text-3xl font-bold">{selectedPond.feedLevel}%</div>
                  </div>
                </div>

                <div className="row-span-2 glass rounded-[24px] p-6 flex flex-col">
                  <p className="text-[11px] uppercase tracking-[1.5px] text-white/60 mb-4">Jadwal Mendatang</p>
                  <ScrollArea className="flex-1">
                    <div className="space-y-0">
                      {selectedSchedules.map((schedule, idx) => (
                        <div 
                          key={schedule.id} 
                          className={cn(
                            "flex justify-between items-center py-4 border-b border-white/10 last:border-none",
                            !schedule.enabled && "opacity-30"
                          )}
                        >
                          <div className="font-mono text-lg">{schedule.time}</div>
                          <div className="text-xs text-white/60">
                            {schedule.amount}g
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <Button 
                    onClick={fetchAIAdvice}
                    disabled={isLoadingAI}
                    className="mt-6 bg-[#00f2ea] text-black hover:brightness-110 font-bold rounded-2xl py-6"
                  >
                    <Sparkles className="w-4 h-4 mr-2" /> {isLoadingAI ? "Menganalisis..." : "Tanya AI Sekarang"}
                  </Button>
                </div>

                <div className="glass rounded-[24px] p-6">
                  <p className="text-[11px] uppercase tracking-[1.5px] text-white/60 mb-2">Suhu Air</p>
                  <div className="flex items-end gap-2">
                    <div className="text-3xl font-semibold">{selectedPond.temperature || 28.4}°C</div>
                    <Thermometer className="w-5 h-5 text-[#00f2ea] mb-1" />
                  </div>
                  <div className="text-[#00f2ea] text-[10px] mt-1 font-bold">↑ Optimal</div>
                </div>

                <div className="glass rounded-[24px] p-6">
                  <p className="text-[11px] uppercase tracking-[1.5px] text-white/60 mb-2">Tingkat pH</p>
                  <div className="flex items-end gap-2">
                    <div className="text-3xl font-semibold">{selectedPond.ph || 7.2}</div>
                    <Droplets className="w-5 h-5 text-[#00f2ea] mb-1" />
                  </div>
                  <div className="text-[#00f2ea] text-[10px] mt-1 font-bold">✓ Stabil</div>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-5">
                  <button 
                    onClick={() => handleManualFeed(200)}
                    className="bg-[#00f2ea] text-black rounded-[24px] p-5 font-bold text-base hover:brightness-110 transition-all flex items-center justify-center gap-3 uppercase tracking-tight"
                  >
                    <Play className="w-5 h-5 fill-current" /> Kasih Pakan (200g)
                  </button>
                  <button 
                    onClick={calibrateSensor}
                    className="bg-white/5 text-white border border-white/20 rounded-[24px] p-5 font-semibold text-sm hover:bg-white/10 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" /> Kalibrasi Sensor
                  </button>
                </div>

                <div className="col-span-3 glass rounded-[32px] p-8 flex items-center justify-between mt-2">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[11px] uppercase tracking-[1.5px] text-white/40">Status Daya</p>
                      <div className="flex items-center gap-3 mt-1">
                        <Battery className="w-6 h-6 text-[#00f2ea]" />
                        <div>
                          <p className="text-sm font-bold">{selectedPond.battery}% Terisi</p>
                          <p className="text-[10px] text-white/40">Panel Surya Aktif</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-12">
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[1.5px] text-white/40">Estimasi Panen</p>
                      <div className="text-xl font-bold mt-1">45 Hari lagi</div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase tracking-[1.5px] text-white/40">FCR Estimasi</p>
                      <div className="text-xl font-bold mt-1 text-[#00f2ea]">1.12</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'schedule' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold">Penjadwalan Otomatis</h2>
                  <Button className="bg-[#00f2ea] text-black hover:brightness-110 rounded-xl">
                    <Plus className="w-4 h-4 mr-2" /> Tambah Jadwal Baru
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedSchedules.map((schedule) => (
                    <Card key={schedule.id} className="glass border-none rounded-3xl p-6">
                      <div className="flex justify-between items-start mb-6">
                        <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
                          <Clock className="w-6 h-6 text-[#00f2ea]" />
                        </div>
                        <Switch 
                          checked={schedule.enabled}
                          onCheckedChange={() => toggleSchedule(schedule.id, schedule.enabled)}
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-3xl font-mono font-bold">{schedule.time}</p>
                        <p className="text-sm text-white/40">Dosis Pakan: {schedule.amount} gram</p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'sensors' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <h2 className="text-xl font-bold">Data Sensor Real-time</h2>
                <div className="grid grid-cols-3 gap-5">
                  <div className="glass rounded-3xl p-8 space-y-4">
                    <div className="p-4 bg-[#00f2ea11] rounded-2xl w-fit">
                      <Thermometer className="w-8 h-8 text-[#00f2ea]" />
                    </div>
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-widest">Suhu Air</p>
                      <p className="text-4xl font-bold">{selectedPond.temperature}°C</p>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="bg-[#00f2ea] h-full" style={{ width: '75%' }} />
                    </div>
                  </div>
                  <div className="glass rounded-3xl p-8 space-y-4">
                    <div className="p-4 bg-blue-500/10 rounded-2xl w-fit">
                      <Droplets className="w-8 h-8 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-widest">Tingkat pH</p>
                      <p className="text-4xl font-bold">{selectedPond.ph}</p>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <div className="bg-blue-400 h-full" style={{ width: '60%' }} />
                    </div>
                  </div>
                  <div className="glass rounded-3xl p-8 space-y-4">
                    <div className="p-4 bg-amber-500/10 rounded-2xl w-fit">
                      <Droplets className="w-8 h-8 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs text-white/40 uppercase tracking-widest">Oksigen Terlarut</p>
                      <p className="text-4xl font-bold">5.8 <span className="text-sm font-normal text-white/40">mg/L</span></p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-6 animate-in fade-in duration-500">
                <h2 className="text-xl font-bold">Riwayat Pemberian Pakan</h2>
                <Card className="glass border-none rounded-3xl p-4">
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div key={log.id} className="flex items-center justify-between p-4 hover:bg-white/5 rounded-2xl transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5 text-[#00f2ea]" />
                            </div>
                            <div>
                              <p className="text-sm font-bold">Pemberian Pakan Otomatis</p>
                              <p className="text-[10px] text-white/40 uppercase tracking-wider">
                                {format(new Date(log.timestamp), 'dd MMM yyyy • HH:mm:ss')}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">{log.amount}g</p>
                            <p className="text-[10px] text-[#00f2ea] uppercase tracking-widest font-bold">Berhasil</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">
                <h2 className="text-xl font-bold">Pengaturan Alat & Kolam</h2>
                <div className="space-y-6">
                  <div className="glass rounded-3xl p-8 space-y-6">
                    <div className="space-y-2">
                      <Label className="text-white/60">Nama Unit Alat</Label>
                      <Input 
                        value={selectedPond.name} 
                        onChange={async (e) => await updateDoc(doc(db, 'ponds', selectedPondId), { name: e.target.value })}
                        className="glass border-white/20 h-12 rounded-xl text-white" 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-white/60">Tipe Kolam</Label>
                        <Select 
                          value={selectedPond.type} 
                          onValueChange={async (val) => await updateDoc(doc(db, 'ponds', selectedPondId), { type: val })}
                        >
                          <SelectTrigger className="glass border-white/20 h-12 rounded-xl text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="glass-dark border-white/20 text-white">
                            <SelectItem value="biofloc">Sistem Bioflok</SelectItem>
                            <SelectItem value="non-biofloc">Sistem Konvensional</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white/60">Populasi Ikan (Ekor)</Label>
                        <Input 
                          type="number" 
                          value={selectedPond.fishCount}
                          onChange={async (e) => await updateDoc(doc(db, 'ponds', selectedPondId), { fishCount: parseInt(e.target.value) })}
                          className="glass border-white/20 h-12 rounded-xl text-white" 
                        />
                      </div>
                    </div>
                  </div>
                  <Button className="w-full bg-[#00f2ea] text-black h-14 rounded-2xl font-bold text-lg hover:brightness-110">
                    Simpan Perubahan
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
             <div className="text-center space-y-4">
               <AlertCircle className="w-12 h-12 text-white/20 mx-auto" />
               <p className="text-white/40">Data tidak ditemukan. Cobalah memuat ulang halaman.</p>
             </div>
          </div>
        )}
      </main>
      
      {/* AI Recommendation Dialog */}
      {recommendation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="glass-dark max-w-md w-full rounded-[32px] p-8 space-y-6 border border-white/10 shadow-2xl">
            <div className="flex items-center gap-3 text-[#00f2ea]">
              <Sparkles className="w-6 h-6 animate-pulse" />
              <h3 className="text-xl font-bold">Hasil Analisis AI</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Frekuensi</p>
                <p className="text-2xl font-bold">{recommendation.frequency}x <span className="text-xs font-normal opacity-40">/ hari</span></p>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Total Dosis</p>
                <p className="text-2xl font-bold">{recommendation.dailyAmount}{recommendation.unit}</p>
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-[#00f2ea]">Rekomendasi Ahli:</p>
              <ScrollArea className="h-32">
                <ul className="space-y-3">
                  {recommendation.tips.map((tip: string, i: number) => (
                    <li key={i} className="text-sm text-white/80 flex gap-3 leading-relaxed">
                      <span className="text-[#00f2ea] text-lg leading-none">•</span> {tip}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
            <Button 
              onClick={() => setRecommendation(null)}
              className="w-full bg-[#00f2ea] text-black hover:brightness-110 font-bold rounded-2xl py-6"
            >
              Mengerti & Terapkan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
