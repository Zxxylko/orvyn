import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, PlusCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface SmartTaskInputProps {
  onSubmit: (input: string) => Promise<void>;
}

export function SmartTaskInput({ onSubmit }: SmartTaskInputProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      <div className="relative flex items-center gap-2 p-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
        <PlusCircle className="w-5 h-5 text-blue-300 flex-shrink-0" />
        
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Contoh: Praktikum Basis Data besok prioritas tinggi 2 jam"
          disabled={loading}
          className="flex-1 bg-transparent text-white placeholder-white/40 outline-none text-sm"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
    </motion.form>
  );
}
