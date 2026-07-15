import { useState } from 'react';
import { Brain, CheckSquare, Command, LayoutDashboard, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface OnboardingTourProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const steps = [
  {
    icon: LayoutDashboard,
    eyebrow: 'Langkah 1 dari 4',
    title: 'Dashboard yang mengikuti caramu belajar',
    detail: 'Klik “Atur dashboard” untuk menyembunyikan widget dan mengurutkan panel samping. Pengaturan tersimpan otomatis di perangkat ini.',
  },
  {
    icon: CheckSquare,
    eyebrow: 'Langkah 2 dari 4',
    title: 'Tulis tugas seperti berbicara biasa',
    detail: 'Masukkan kalimat seperti “Laporan basis data besok prioritas tinggi 2 jam”. ORVYN akan membaca deadline, durasi, dan prioritasnya.',
  },
  {
    icon: Brain,
    eyebrow: 'Langkah 3 dari 4',
    title: 'Geser prioritas, buka detail tanpa pindah',
    detail: 'Drag tugas antar kolom di desktop, atau gunakan menu Pindahkan di mobile. Klik judul tugas untuk membuka editor lengkap dari sisi layar.',
  },
  {
    icon: Command,
    eyebrow: 'Langkah 4 dari 4',
    title: 'Semua aksi bisa ditemukan cepat',
    detail: 'Tekan Cmd/Ctrl + K kapan pun untuk berpindah halaman, menambah tugas, membuat briefing, atau merapikan jadwal.',
  },
];

export function OnboardingTour({ open, onOpenChange }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const Icon = current.icon;

  const close = () => {
    localStorage.setItem('orvyn-onboarding-seen', 'true');
    setStep(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="w-[calc(100%-2rem)] overflow-hidden rounded-3xl border border-white/10 bg-slate-950 p-0 text-white shadow-2xl sm:max-w-lg">
        <div className="relative overflow-hidden border-b border-white/10 bg-cyan-300/[0.06] px-6 py-8">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
            <Icon className="h-6 w-6" />
          </div>
          <p className="relative mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">{current.eyebrow}</p>
          <DialogTitle className="relative mt-2 pr-8 text-2xl font-semibold leading-tight text-white">{current.title}</DialogTitle>
          <DialogDescription className="relative mt-3 text-sm font-medium leading-relaxed text-slate-400">{current.detail}</DialogDescription>
        </div>

        <div className="px-6 py-5">
          <div className="mb-5 flex gap-2" aria-label={`Langkah ${step + 1} dari ${steps.length}`}>
            {steps.map((item, index) => (
              <span key={item.title} className={`h-1 flex-1 rounded-full transition ${index <= step ? 'bg-cyan-300' : 'bg-white/10'}`} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={close} className="focus-ring rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-white/5 hover:text-slate-300">
              Lewati
            </button>
            <div className="flex gap-2">
              {step > 0 && (
                <button type="button" onClick={() => setStep((value) => value - 1)} className="secondary-action">
                  Kembali
                </button>
              )}
              <button
                type="button"
                onClick={() => step === steps.length - 1 ? close() : setStep((value) => value + 1)}
                className="primary-action"
              >
                {step === steps.length - 1 ? <><Sparkles className="h-4 w-4" /> Mulai gunakan ORVYN</> : 'Lanjut'}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
