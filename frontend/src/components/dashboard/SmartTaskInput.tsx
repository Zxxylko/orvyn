import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, PlusCircle } from 'lucide-react';

interface SmartTaskInputProps {
  onSubmit: (input: string) => Promise<void>;
}

export function SmartTaskInput({ onSubmit }: SmartTaskInputProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();

    window.addEventListener('orvyn:focus-smart-task', focusInput);
    return () => window.removeEventListener('orvyn:focus-smart-task', focusInput);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    try {
      await onSubmit(input);
      setInput('');
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative"
    >
      <div className={`relative flex items-center gap-2 rounded-2xl border bg-white/5 p-3 shadow-2xl backdrop-blur-xl transition sm:p-4 ${focused ? 'border-cyan-300/35 shadow-cyan-950/30' : 'border-white/10'}`}>
        <PlusCircle className="w-5 h-5 text-blue-300 flex-shrink-0" />
        
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Contoh: Praktikum Basis Data besok prioritas tinggi 2 jam"
          disabled={loading}
          className="flex-1 bg-transparent text-white placeholder-white/40 outline-none text-sm"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="focus-ring rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Tambah'
          )}
        </button>
      </div>

      {/* Hint text */}
      <p className="mt-2 text-xs text-white/40 text-center">
        ORVYN akan membaca deadline, durasi, dan prioritas dari kalimatmu.
      </p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Contoh tugas cepat">
        {['Laporan besok 2 jam', 'Kuis Jumat prioritas tinggi', 'Baca materi 30 menit'].map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setInput(example);
              inputRef.current?.focus();
            }}
            className="focus-ring whitespace-nowrap rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-semibold text-slate-500 transition hover:border-cyan-300/20 hover:text-cyan-200"
          >
            {example}
          </button>
        ))}
      </div>
    </form>
  );
}
