import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Flame, Volume2, VolumeX, Star, ArrowRight } from 'lucide-react';
import type { Task } from '@/types/task';
import { cn } from '@/lib/utils';

interface FocusTimerProps {
  tasks: Task[];
  onCompleteTask?: (taskId: string) => void;
  onLogSession?: (data: {
    task_id: string | null;
    planned_minutes: number;
    actual_minutes: number;
    focus_rating: number;
    completed: boolean;
    session_type: string;
    started_at: string;
    ended_at: string;
  }) => Promise<unknown>;
}

type WindowWithWebkitAudio = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function FocusTimer({ tasks, onCompleteTask, onLogSession }: FocusTimerProps) {
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Focus Session logging helper states
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [showRatingPrompt, setShowRatingPrompt] = useState(false);
  const [rating, setRating] = useState<number>(4);
  const [loggingInProgress, setLoggingInProgress] = useState(false);
  
  const totalDuration = isBreak ? 5 * 60 : 25 * 60;
  const remainingTime = minutes * 60 + seconds;
  const progress = ((totalDuration - remainingTime) / totalDuration) * 100;
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sound generator using Web Audio API so no audio file assets are needed
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioContextConstructor = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
      if (!AudioContextConstructor) return;

      const audioCtx = new AudioContextConstructor();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5 note
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1.2);
    } catch (e) {
      console.warn('Web Audio play failed', e);
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        if (seconds > 0) {
          setSeconds(seconds - 1);
        } else if (seconds === 0) {
          if (minutes === 0) {
            // Timer complete!
            playAlertSound();
            setIsActive(false);
            if (isBreak) {
              setMinutes(25);
              setIsBreak(false);
            } else {
              // Focus session completed! Display rating prompt before going into break.
              setShowRatingPrompt(true);
              // Fallback break minutes setup will happen after logging rating.
            }
          } else {
            setMinutes(minutes - 1);
            setSeconds(59);
          }
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, minutes, seconds, isBreak, playAlertSound]);

  const toggleTimer = () => {
    if (!isActive && !isBreak && !startedAt) {
      setStartedAt(new Date().toISOString());
    }
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setIsBreak(false);
    setMinutes(25);
    setSeconds(0);
    setStartedAt(null);
  };

  const handleSkip = () => {
    setIsActive(false);
    if (!isBreak) {
      // Skipped focus: we still prompt to log if they worked at least 1 min
      const workedMins = Math.floor((25 * 60 - remainingTime) / 60);
      if (workedMins >= 1) {
        setShowRatingPrompt(true);
      } else {
        setMinutes(5);
        setIsBreak(true);
      }
    } else {
      setMinutes(25);
      setIsBreak(false);
      setStartedAt(null);
    }
    setSeconds(0);
  };

  const submitFocusLog = async () => {
    if (!onLogSession) {
      // In case api is not loaded
      setShowRatingPrompt(false);
      setMinutes(5);
      setIsBreak(true);
      setSeconds(0);
      setStartedAt(null);
      return;
    }

    setLoggingInProgress(true);
    try {
      const plannedSecs = 25 * 60;
      const actualSecs = plannedSecs - remainingTime;
      const plannedMins = Math.max(1, Math.round(plannedSecs / 60));
      const actualMins = Math.max(1, Math.round(actualSecs / 60));

      await onLogSession({
        task_id: selectedTaskId || null,
        planned_minutes: plannedMins,
        actual_minutes: actualMins,
        focus_rating: rating,
        completed: actualSecs >= plannedSecs - 30, // completed if within 30s of target
        session_type: 'pomodoro',
        started_at: startedAt || new Date(Date.now() - actualSecs * 1000).toISOString(),
        ended_at: new Date().toISOString(),
      });

      // Task completion callback if task is completed
      if (selectedTaskId && actualSecs >= plannedSecs - 30) {
        if (onCompleteTask) {
          onCompleteTask(selectedTaskId);
        }
      }

      setShowRatingPrompt(false);
      setMinutes(5);
      setIsBreak(true);
      setSeconds(0);
      setStartedAt(null);
    } catch (err) {
      console.error('Focus logging error', err);
    } finally {
      setLoggingInProgress(false);
    }
  };

  const getRatingLabel = (val: number) => {
    switch (val) {
      case 1: return 'Distracted';
      case 2: return 'Low Focus';
      case 3: return 'Steady Progress';
      case 4: return 'High Flow';
      case 5: return 'Absolute Zone';
      default: return '';
    }
  };

  if (showRatingPrompt) {
    return (
      <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl flex flex-col justify-between h-full relative overflow-hidden text-center min-h-[300px]">
        {/* Decorative gradient glow */}
        <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl bg-purple-500/10 pointer-events-none" />

        <div className="space-y-3">
          <div className="flex justify-center mb-1">
            <div className="p-3 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Flame className="w-8 h-8 animate-bounce" />
            </div>
          </div>
          <h3 className="text-base font-bold text-white tracking-wide">
            Session Logged!
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed px-2">
            How deep was your flow state during this Focus session?
          </p>
        </div>

        {/* Dynamic Rating Stars */}
        <div className="my-5 space-y-2">
          <div className="flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((val) => (
              <button
                key={val}
                onClick={() => setRating(val)}
                className="p-1 text-slate-500 hover:text-yellow-400 hover:scale-110 transition cursor-pointer"
              >
                <Star
                  size={26}
                  fill={val <= rating ? 'currentColor' : 'none'}
                  className={cn(val <= rating ? 'text-yellow-400' : 'text-slate-600')}
                />
              </button>
            ))}
          </div>
          <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest leading-none">
            {getRatingLabel(rating)}
          </div>
        </div>

        <button
          onClick={submitFocusLog}
          disabled={loggingInProgress}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-xs font-semibold uppercase tracking-wider text-slate-950 transition hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
        >
          {loggingInProgress ? 'Logging...' : 'Save & Rest'}
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-xl flex flex-col items-center relative overflow-hidden h-full">
      {/* Decorative gradient glow */}
      <div className={cn(
        "absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl transition duration-500 pointer-events-none",
        isBreak ? "bg-cyan-500/10" : "bg-purple-500/10"
      )} />

      <div className="flex items-center justify-between w-full mb-4">
        <div className="flex items-center gap-2">
          <Flame className={cn("w-5 h-5", isBreak ? "text-cyan-400" : "text-purple-400 animate-pulse")} />
          <span className="text-sm font-bold tracking-wider text-slate-300 uppercase">
            {isBreak ? 'Short Break' : 'Focus Session'}
          </span>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-1 text-slate-400 hover:text-white rounded transition cursor-pointer"
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
      </div>

      {/* Circular Glowing Timer */}
      <div className="relative flex items-center justify-center w-36 h-36 my-2">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="72"
            cy="72"
            r="64"
            className="stroke-white/5 fill-transparent"
            strokeWidth="6"
          />
          <circle
            cx="72"
            cy="72"
            r="64"
            className={cn(
              "fill-transparent transition-all duration-300",
              isBreak ? "stroke-cyan-500" : "stroke-purple-500"
            )}
            strokeWidth="6"
            strokeDasharray={2 * Math.PI * 64}
            strokeDashoffset={2 * Math.PI * 64 * (1 - progress / 100)}
            strokeLinecap="round"
          />
        </svg>

        {/* Dynamic Text inside Circle */}
        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-extrabold tracking-tight text-white leading-none">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1.5">
            {isBreak ? 'Unwind' : 'Grind'}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 my-4">
        <button
          onClick={resetTimer}
          className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={toggleTimer}
          className={cn(
            "px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg transition flex items-center gap-2 cursor-pointer",
            isActive 
              ? "bg-slate-800 hover:bg-slate-700 shadow-slate-800/20"
              : isBreak 
                ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:shadow-cyan-600/30"
                : "bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-purple-600/30"
          )}
        >
          {isActive ? (
            <>
              <Pause size={14} fill="currentColor" />
              Pause
            </>
          ) : (
            <>
              <Play size={14} fill="currentColor" />
              Start
            </>
          )}
        </button>
        <button
          onClick={handleSkip}
          className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 text-xs font-semibold cursor-pointer"
        >
          Skip
        </button>
      </div>

      {/* Task Link Selector */}
      <div className="w-full mt-2">
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 px-1">
          Link to Active Task
        </label>
        <select
          value={selectedTaskId}
          onChange={(e) => setSelectedTaskId(e.target.value)}
          disabled={isActive}
          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none focus:border-purple-500/50 transition disabled:opacity-50"
        >
          <option value="">No task linked</option>
          {tasks
            .filter((t) => t.status !== 'completed')
            .map((task) => (
              <option key={task.id} value={task.id}>
                {task.priority === 'critical' ? '[Critical] ' : task.priority === 'high' ? '[High] ' : ''}
                {task.title}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
