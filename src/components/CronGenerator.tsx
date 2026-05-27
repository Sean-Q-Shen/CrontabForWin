import React, { useState, useEffect } from 'react';

interface CronGeneratorProps {
  initialValue: string;
  onChange: (cron: string) => void;
}

export function CronGenerator({ initialValue, onChange }: CronGeneratorProps) {
  // Translate existing Cron expression to visual state if possible
  const parseInitial = (cron: string) => {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) {
      return {
        cycle: 'custom' as const,
        hour: '08',
        minute: '00',
        weeklyDays: [1, 3, 5],
        monthlyDays: [1],
        intervalType: 'minute' as const,
        intervalValue: 5,
        customValue: cron,
      };
    }

    const [min, hr, dom, mon, dow] = parts;

    // 1. Every N minutes: */N * * * *
    if (min.startsWith('*/') && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
      const val = parseInt(min.replace('*/', ''), 10);
      if (!isNaN(val)) {
        return {
          cycle: 'interval' as const,
          hour: '08',
          minute: '00',
          weeklyDays: [1, 3, 5],
          monthlyDays: [1],
          intervalType: 'minute' as const,
          intervalValue: val,
          customValue: cron,
        };
      }
    }

    // 2. Every N hours: M */N * * * -> M is a number
    if (/^\d+$/.test(min) && hr.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
      const val = parseInt(hr.replace('*/', ''), 10);
      if (!isNaN(val)) {
        return {
          cycle: 'interval' as const,
          hour: '08',
          minute: min.padStart(2, '0'),
          weeklyDays: [1, 3, 5],
          monthlyDays: [1],
          intervalType: 'hour' as const,
          intervalValue: val,
          customValue: cron,
        };
      }
    }

    // 3. Daily: M H * * *
    if (/^\d+$/.test(min) && /^\d+$/.test(hr) && dom === '*' && mon === '*' && dow === '*') {
      return {
        cycle: 'daily' as const,
        hour: hr.padStart(2, '0'),
        minute: min.padStart(2, '0'),
        weeklyDays: [1, 3, 5],
        monthlyDays: [1],
        intervalType: 'minute' as const,
        intervalValue: 5,
        customValue: cron,
      };
    }

    // 4. Weekly: M H * * DOW-separated-by-comma
    if (/^\d+$/.test(min) && /^\d+$/.test(hr) && dom === '*' && mon === '*' && /^[0-7,]+$/.test(dow)) {
      const days = dow.split(',').map(Number).map(d => d === 7 ? 0 : d);
      return {
        cycle: 'weekly' as const,
        hour: hr.padStart(2, '0'),
        minute: min.padStart(2, '0'),
        weeklyDays: days.filter((v, i, a) => a.indexOf(v) === i),
        monthlyDays: [1],
        intervalType: 'minute' as const,
        intervalValue: 5,
        customValue: cron,
      };
    }

    // 5. Monthly: M H DOM * *
    if (/^\d+$/.test(min) && /^\d+$/.test(hr) && /^\d+(,\d+)*$/.test(dom) && mon === '*' && dow === '*') {
      const days = dom.split(',').map(Number);
      return {
        cycle: 'monthly' as const,
        hour: hr.padStart(2, '0'),
        minute: min.padStart(2, '0'),
        weeklyDays: [1, 3, 5],
        monthlyDays: days.filter((v, i, a) => a.indexOf(v) === i),
        intervalType: 'minute' as const,
        intervalValue: 5,
        customValue: cron,
      };
    }

    // Default to custom if we can't perfectly decode
    return {
      cycle: 'custom' as const,
      hour: '08',
      minute: '00',
      weeklyDays: [1, 3, 5],
      monthlyDays: [1],
      intervalType: 'minute' as const,
      intervalValue: 5,
      customValue: cron,
    };
  };

  const parsed = parseInitial(initialValue || '0 8 * * 1,3,5');

  const [cycle, setCycle] = useState<'daily' | 'weekly' | 'monthly' | 'interval' | 'custom'>(parsed.cycle);
  const [hour, setHour] = useState<string>(parsed.hour);
  const [minute, setMinute] = useState<string>(parsed.minute);
  const [weeklyDays, setWeeklyDays] = useState<number[]>(parsed.weeklyDays);
  const [monthlyDays, setMonthlyDays] = useState<number[]>(parsed.monthlyDays);
  const [intervalType, setIntervalType] = useState<'minute' | 'hour'>(parsed.intervalType);
  const [intervalValue, setIntervalValue] = useState<number>(parsed.intervalValue);
  const [customValue, setCustomValue] = useState<string>(parsed.customValue);

  // Sync state with parent on changes
  useEffect(() => {
    let cronExpr = '';
    if (cycle === 'daily') {
      const h = parseInt(hour, 10).toString();
      const m = parseInt(minute, 10).toString();
      cronExpr = `${m} ${h} * * *`;
    } else if (cycle === 'weekly') {
      const h = parseInt(hour, 10).toString();
      const m = parseInt(minute, 10).toString();
      const days = weeklyDays.length > 0 ? [...weeklyDays].sort().join(',') : '*';
      cronExpr = `${m} ${h} * * ${days}`;
    } else if (cycle === 'monthly') {
      const h = parseInt(hour, 10).toString();
      const m = parseInt(minute, 10).toString();
      const days = monthlyDays.length > 0 ? [...monthlyDays].sort((a,b)=>a-b).join(',') : '1';
      cronExpr = `${m} ${h} ${days} * *`;
    } else if (cycle === 'interval') {
      if (intervalType === 'minute') {
        cronExpr = `*/${intervalValue} * * * *`;
      } else {
        const m = parseInt(minute, 10).toString();
        cronExpr = `${m} */${intervalValue} * * *`;
      }
    } else if (cycle === 'custom') {
      cronExpr = customValue;
    }

    onChange(cronExpr);
  }, [cycle, hour, minute, weeklyDays, monthlyDays, intervalType, intervalValue, customValue]);

  const toggleWeeklyDay = (day: number) => {
    if (weeklyDays.includes(day)) {
      setWeeklyDays(weeklyDays.filter(d => d !== day));
    } else {
      setWeeklyDays([...weeklyDays, day]);
    }
  };

  const toggleMonthlyDay = (day: number) => {
    if (monthlyDays.includes(day)) {
      setMonthlyDays(monthlyDays.filter(d => d !== day));
    } else {
      setMonthlyDays([...monthlyDays, day]);
    }
  };

  const weekdaysList = [
    { label: '周一', val: 1 },
    { label: '周二', val: 2 },
    { label: '周三', val: 3 },
    { label: '周四', val: 4 },
    { label: '周五', val: 5 },
    { label: '周六', val: 6 },
    { label: '周日', val: 0 },
  ];

  return (
    <div className="bg-[#0f1115] border border-[#2d303a] rounded p-3 text-white space-y-3">
      <div className="flex flex-wrap gap-1.5 pb-2 border-b border-[#2d303a]">
        <button
          type="button"
          onClick={() => setCycle('daily')}
          className={`px-2 py-1 rounded text-xs select-none border transition ${cycle === 'daily' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#15171e] border-[#2d303a] text-zinc-400 hover:text-white'}`}
        >
          每天定时
        </button>
        <button
          type="button"
          onClick={() => setCycle('weekly')}
          className={`px-2 py-1 rounded text-xs select-none border transition ${cycle === 'weekly' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#15171e] border-[#2d303a] text-zinc-400 hover:text-white'}`}
        >
          每周特定天
        </button>
        <button
          type="button"
          onClick={() => setCycle('monthly')}
          className={`px-2 py-1 rounded text-xs select-none border transition ${cycle === 'monthly' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#15171e] border-[#2d303a] text-zinc-400 hover:text-white'}`}
        >
          每月特定日期
        </button>
        <button
          type="button"
          onClick={() => setCycle('interval')}
          className={`px-2 py-1 rounded text-xs select-none border transition ${cycle === 'interval' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#15171e] border-[#2d303a] text-zinc-400 hover:text-white'}`}
        >
          固定周期
        </button>
        <button
          type="button"
          onClick={() => setCycle('custom')}
          className={`px-2 py-1 rounded text-xs select-none border transition ${cycle === 'custom' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#15171e] border-[#2d303a] text-zinc-400 hover:text-white'}`}
        >
          高级自定义
        </button>
      </div>

      {cycle === 'daily' && (
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-xs shrink-0">执行时间:</span>
          <select value={hour} onChange={(e) => setHour(e.target.value)} className="bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-white">
            {Array.from({ length: 24 }).map((_, i) => {
              const val = i.toString().padStart(2, '0');
              return <option key={val} value={val}>{val} 点</option>;
            })}
          </select>
          <span className="text-zinc-500">:</span>
          <select value={minute} onChange={(e) => setMinute(e.target.value)} className="bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-white">
            {Array.from({ length: 60 }).map((_, i) => {
              const val = i.toString().padStart(2, '0');
              return <option key={val} value={val}>{val} 分</option>;
            })}
          </select>
        </div>
      )}

      {cycle === 'weekly' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {weekdaysList.map((day) => {
              const selected = weeklyDays.includes(day.val);
              return (
                <button
                  type="button"
                  key={day.val}
                  onClick={() => toggleWeeklyDay(day.val)}
                  className={`px-2 py-1 rounded text-xs border select-none transition ${selected ? 'bg-amber-600/30 border-amber-500 text-amber-200' : 'bg-[#15171e] border-[#2d303a] text-zinc-400 hover:border-zinc-700'}`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs shrink-0">执行时间:</span>
            <select value={hour} onChange={(e) => setHour(e.target.value)} className="bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-white">
              {Array.from({ length: 24 }).map((_, i) => {
                const val = i.toString().padStart(2, '0');
                return <option key={val} value={val}>{val} 点</option>;
              })}
            </select>
            <span className="text-zinc-500">:</span>
            <select value={minute} onChange={(e) => setMinute(e.target.value)} className="bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-white">
              {Array.from({ length: 60 }).map((_, i) => {
                const val = i.toString().padStart(2, '0');
                return <option key={val} value={val}>{val} 分</option>;
              })}
            </select>
          </div>
        </div>
      )}

      {cycle === 'monthly' && (
        <div className="space-y-3">
          <div>
            <div className="text-zinc-400 text-xs mb-2">选择每月的几号 (可多选):</div>
            <div className="grid grid-cols-7 gap-1 max-h-[140px] overflow-y-auto pr-1">
              {Array.from({ length: 31 }).map((_, i) => {
                const day = i + 1;
                const selected = monthlyDays.includes(day);
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleMonthlyDay(day)}
                    className={`p-1 text-center rounded text-xs border select-none transition ${selected ? 'bg-amber-600/30 border-amber-500 text-amber-200' : 'bg-[#15171e] border-[#2d303a] text-zinc-400 hover:border-zinc-700'}`}
                  >
                    {day}日
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs shrink-0">执行时间:</span>
            <select value={hour} onChange={(e) => setHour(e.target.value)} className="bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-white">
              {Array.from({ length: 24 }).map((_, i) => {
                const val = i.toString().padStart(2, '0');
                return <option key={val} value={val}>{val} 点</option>;
              })}
            </select>
            <span className="text-zinc-500">:</span>
            <select value={minute} onChange={(e) => setMinute(e.target.value)} className="bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-white">
              {Array.from({ length: 60 }).map((_, i) => {
                const val = i.toString().padStart(2, '0');
                return <option key={val} value={val}>{val} 分</option>;
              })}
            </select>
          </div>
        </div>
      )}

      {cycle === 'interval' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-300">
              <input
                type="radio"
                checked={intervalType === 'minute'}
                onChange={() => setIntervalType('minute')}
                className="accent-blue-500"
              />
              每隔 N 分钟
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-300">
              <input
                type="radio"
                checked={intervalType === 'hour'}
                onChange={() => setIntervalType('hour')}
                className="accent-blue-500"
              />
              每隔 N 小时
            </label>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs shrink-0">时间间隔:</span>
            {intervalType === 'minute' ? (
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 text-xs">每</span>
                <input
                  type="number"
                  min="1"
                  max="59"
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value, 10)))}
                  className="w-16 bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-center text-white font-mono"
                />
                <span className="text-zinc-400 text-xs">分钟执行一次</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-400 text-xs">每</span>
                <input
                  type="number"
                  min="1"
                  max="23"
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value, 10)))}
                  className="w-16 bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-center text-white font-mono"
                />
                <span className="text-zinc-400 text-xs">小时 (在第</span>
                <select value={minute} onChange={(e) => setMinute(e.target.value)} className="bg-[#15171e] border border-[#2d303a] rounded px-2 py-1 outline-none text-sm text-white">
                  {Array.from({ length: 60 }).map((_, i) => {
                    const val = i.toString().padStart(2, '0');
                    return <option key={val} value={val}>{val} 分</option>;
                  })}
                </select>
                <span className="text-zinc-400 text-xs">整分执行)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {cycle === 'custom' && (
        <div className="space-y-1">
          <label className="text-zinc-400 text-xs block mb-1">手动输入/微调 Cron 表达式 (5位: 分 时 日 月 周):</label>
          <input
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="例如: */5 * * * *"
            className="w-full bg-[#15171e] border border-[#2d303a] rounded px-3 py-1.5 text-white outline-none focus:border-blue-500 font-mono text-sm"
          />
        </div>
      )}
    </div>
  );
}
