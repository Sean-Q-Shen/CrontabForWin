import React, { useState, useEffect, useRef } from 'react';
import { CronGenerator } from './components/CronGenerator';

export default function App() {
  const [search, setSearch] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({ active: 0, todayRuns: 0, successRate: 0, lastError: '--' });
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
        setStats(prev => ({ ...prev, active: data.filter((t: any) => t.enabled).length }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<any>({ shPath: '', pythonPath: '', encoding: 'utf8' });
  const [historyTask, setHistoryTask] = useState<any>(null);
  const [taskLogs, setTaskLogs] = useState<any[]>([]);

  const [cronMode, setCronMode] = useState<'visual' | 'raw'>('visual');
  const [cronValue, setCronValue] = useState('1 8 * * 1,3,5');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportTasks = () => {
    try {
      const exportedData = tasks.map(t => ({
        name: t.name,
        cron: t.cron,
        script: t.script,
        type: t.type || 'shell',
        enabled: t.enabled !== false,
        timeout: t.timeout !== undefined ? t.timeout : 0,
        retryCount: t.retryCount !== undefined ? t.retryCount : 1,
        cwd: t.cwd || '',
        envVars: t.envVars || ''
      }));

      const dataStr = JSON.stringify(exportedData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cronwin-tasks-${new Date().toISOString().substring(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('导出失败: ' + e.message);
    }
  };

  const handleImportTasksClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          alert('导入失败: JSON 格式错误，必须为定时任务列表数组！');
          return;
        }

        // Validate basic fields
        for (const item of parsed) {
          if (!item.name || !item.script) {
            alert('导入失败: 每一个任务必须包含 "name"(名称) 和 "script"(执行命令) 字段。');
            return;
          }
        }

        const res = await fetch('/api/tasks/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });

        if (res.ok) {
          const result = await res.json();
          alert(`成功导入 ${result.count} 个任务！`);
          fetchTasks(); // Refresh list
        } else {
          const errText = await res.text();
          alert('导入失败: ' + errText);
        }
      } catch (err: any) {
        alert('解析 JSON 失败: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const openTaskModal = (task: any = null) => {
    setEditTask(task);
    if (task) {
      setCronValue(task.cron || '1 8 * * 1,3,5');
      setCronMode('visual');
    } else {
      setCronValue('1 8 * * 1,3,5');
      setCronMode('visual');
    }
    setShowModal(true);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchLogs();
    fetchSettings();
    const interval = setInterval(() => {
      fetchTasks();
      fetchLogs();
    }, 3000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModal(false);
        setShowSettingsModal(false);
        setHistoryTask(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSaveTask = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      name: formData.get('name'),
      cron: formData.get('cron'),
      script: formData.get('script'),
      enabled: formData.get('enabled') === 'on',
      timeout: parseInt(formData.get('timeout') as string || '0', 10),
      retryCount: parseInt(formData.get('retryCount') as string || '1', 10),
      cwd: formData.get('cwd') as string || '',
      envVars: formData.get('envVars') as string || '',
    };

    try {
      let res;
      if (editTask) {
        res = await fetch(`/api/tasks/${editTask.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
      } else {
        res = await fetch('/api/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
      }
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || res.statusText);
      }
      
      setShowModal(false);
      fetchTasks();
    } catch (e: any) {
      alert("保存失败 (Error saving task):\n" + e.message);
    }
  };

  const handleRunTask = async (id: number) => {
    await fetch(`/api/tasks/${id}/run`, { method: 'POST' });
    fetchTasks();
  };

  const handleDeleteTask = async (id: number) => {
    if(confirm("确定删除任务?")) {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      fetchTasks();
    }
  };
  
  const handleToggleTask = async (task: any) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...task, enabled: !task.enabled })
      });
      fetchTasks();
    } catch (e) {
      alert("切换状态失败");
    }
  };

  const handleViewHistory = async (task: any) => {
    setHistoryTask(task);
    setTaskLogs([]);
    try {
      const res = await fetch(`/api/tasks/${task.id}/history`);
      if (res.ok) {
        setTaskLogs(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearLogs = async () => {
    await fetch(`/api/logs`, { method: 'DELETE' });
    fetchLogs();
  };

  const handleSaveSettings = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      shPath: formData.get('shPath') || '',
      pythonPath: formData.get('pythonPath') || '',
      encoding: formData.get('encoding') || 'utf8',
    };
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
      });
      if (res.ok) {
        setShowSettingsModal(false);
        fetchSettings();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (e: any) {
      alert("保存失败:\n" + e.message);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0f1115] text-[#e0e0e0] font-sans overflow-hidden">
      {/* Title Bar */}
      <div className="h-10 bg-[#1c1e26] flex items-center justify-between px-4 border-b border-[#2d303a] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </div>
          <span className="text-xs font-semibold tracking-wide text-zinc-400">CronWin v2.4.0 - 任务计划管理器</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-60 bg-[#15171e] border-r border-[#2d303a] flex flex-col shrink-0 hidden md:flex">
          <div className="p-4">
            <button onClick={() => openTaskModal(null)} className="w-full bg-[#0078d4] hover:bg-[#1085e0] text-white py-2 rounded text-sm font-medium flex items-center justify-center gap-2">
              <span className="text-lg leading-none">+</span> 新建定时任务
            </button>
          </div>
          <nav className="flex-1 px-2 space-y-1">
            <div className="bg-[#2d303a] text-white px-3 py-2 rounded flex items-center gap-3 text-sm cursor-pointer">
              <span className="opacity-70">📋</span> 所有任务
            </div>
            <div className="hover:bg-[#25272f] text-zinc-400 px-3 py-2 rounded flex items-center justify-between text-sm cursor-pointer">
              <div className="flex items-center gap-3"><span>🐍</span> Python 脚本</div>
              <span className="text-[10px] bg-[#2d303a] px-1.5 rounded">{tasks.filter(t => t.script?.includes('python')).length}</span>
            </div>
            <div className="hover:bg-[#25272f] text-zinc-400 px-3 py-2 rounded flex items-center justify-between text-sm cursor-pointer">
              <div className="flex items-center gap-3"><span>🐚</span> Shell/Git Bash</div>
              <span className="text-[10px] bg-[#2d303a] px-1.5 rounded">{tasks.filter(t => !t.script?.includes('python')).length}</span>
            </div>
            
            <div onClick={() => setShowSettingsModal(true)} className="hover:bg-[#25272f] text-zinc-400 px-3 py-3 mt-4 rounded flex items-center gap-3 text-sm cursor-pointer transition-colors border-t border-[#2d303a]">
              <span className="opacity-70">⚙️</span> 系统设置
            </div>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-[#0f1115] overflow-hidden">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 border-b border-[#2d303a] shrink-0">
            <div className="bg-[#1c1e26] p-3 border border-[#2d303a] rounded">
              <p className="text-xs text-zinc-500 uppercase">活动任务</p>
              <p className="text-2xl font-mono text-blue-400 mt-1">{stats.active}</p>
            </div>
            <div className="bg-[#1c1e26] p-3 border border-[#2d303a] rounded">
              <p className="text-xs text-zinc-500 uppercase">系统状态</p>
              <p className="text-2xl font-mono text-zinc-200 mt-1">OK</p>
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-4 flex flex-col">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 shrink-0 gap-3">
              <h2 className="text-sm font-semibold">任务列表</h2>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="搜索..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-[#1c1e26] border border-[#2d303a] rounded px-3 py-1 outline-none text-xs focus:border-blue-500 w-48 text-zinc-300"
                />
                <button onClick={fetchTasks} className="bg-[#2d303a] px-3 py-1 rounded text-xs text-white hover:bg-[#3d414f] transition-colors">刷新</button>
                <button onClick={handleExportTasks} className="bg-[#1c1e26] border border-[#2d303a] px-3 py-1 rounded text-xs text-[#e0e0e0] hover:bg-[#2d303a] hover:text-white transition-all flex items-center gap-1 select-none">
                  <span>📥</span> 导出任务
                </button>
                <button onClick={handleImportTasksClick} className="bg-[#1c1e26] border border-[#2d303a] px-3 py-1 rounded text-xs text-[#e0e0e0] hover:bg-[#2d303a] hover:text-white transition-all flex items-center gap-1 select-none">
                  <span>📤</span> 导入任务
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFileChange}
                  accept=".json"
                  className="hidden"
                />
                <button onClick={() => openTaskModal(null)} className="md:hidden bg-[#0078d4] px-3 py-1 rounded text-xs text-white">新建</button>
              </div>
            </div>
            
            <div className="flex-1 border border-[#2d303a] rounded overflow-auto flex flex-col">
               <table className="w-full text-xs text-left min-w-[700px]">
                <thead className="bg-[#1c1e26] text-zinc-400 border-b border-[#2d303a] sticky top-0 z-10">
                  <tr>
                    <th className="p-3 font-medium">状态</th>
                    <th className="p-3 font-medium">任务名称</th>
                    <th className="p-3 font-medium">Cron</th>
                    <th className="p-3 font-medium">上次运行状态</th>
                    <th className="p-3 font-medium">上次运行</th>
                    <th className="p-3 font-medium">下一次运行</th>
                    <th className="p-3 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d303a] font-mono text-zinc-300">
                  {tasks.filter(t => t.name.toLowerCase().includes(search.toLowerCase())).map((task, idx) => (
                    <tr key={task.id} className={`hover:bg-[#1c1e26] ${idx % 2 === 1 ? 'bg-[#14161d]' : ''}`}>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px]
                          ${task.status === 'RUNNING' ? 'bg-amber-900/40 text-amber-400' : 
                            task.status === 'IDLE' ? 'bg-blue-900/30 text-blue-400' : 
                            task.status === 'FAILED' ? 'bg-red-900/30 text-red-400' : 
                            'bg-zinc-800 text-zinc-400'}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="p-3 font-sans truncate" title={task.script}>{task.name}</td>
                      <td className="p-3">{task.cron}</td>
                      <td className="p-3">
                        {task.lastStatus === 'SUCCESS' && <span className="text-green-400">成功</span>}
                        {task.lastStatus === 'FAILED' && <span className="text-red-400">失败</span>}
                        {!task.lastStatus && <span className="text-zinc-600">--</span>}
                      </td>
                      <td className="p-3">{task.lastRun}</td>
                      <td className="p-3 text-zinc-400">{task.nextRun || '--'}</td>
                      <td className="p-3 text-right text-blue-400 space-x-2">
                        <span onClick={() => handleToggleTask(task)} className="cursor-pointer hover:underline text-orange-400">
                          {task.enabled ? '停用' : '启用'}
                        </span>
                        <span className="text-zinc-600">|</span>
                        <span onClick={() => handleRunTask(task.id)} className="cursor-pointer hover:underline text-green-400">运行</span>
                        <span className="text-zinc-600">|</span>
                        <span onClick={() => handleViewHistory(task)} className="cursor-pointer hover:underline text-purple-400">日志</span>
                        <span className="text-zinc-600">|</span>
                        <span onClick={() => openTaskModal(task)} className="cursor-pointer hover:underline">编辑</span>
                        <span className="text-zinc-600">|</span>
                        <span onClick={() => handleDeleteTask(task.id)} className="cursor-pointer hover:underline text-red-400">删除</span>
                      </td>
                    </tr>
                  ))}
                  {tasks.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-zinc-500 font-sans">暂无任务</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Console */}
          <div className="h-48 md:h-56 bg-black border-t border-[#2d303a] p-3 font-mono text-[11px] shrink-0 overflow-y-auto flex flex-col">
            <div className="flex justify-between items-center mb-2 sticky top-0 bg-black/90 backdrop-blur pb-1 z-10">
              <span className="text-zinc-500">实时执行控制台 (Logs)</span>
              <button onClick={handleClearLogs} className="text-blue-500 hover:text-blue-400 cursor-pointer">清空日志</button>
            </div>
            <div className="text-zinc-400 space-y-1 flex-1">
              {[...logs].reverse().map((log, i) => (
                <p key={log.id}><span className={log.type === 'error' ? 'text-red-600' : log.type === 'success' ? 'text-green-500' : 'text-blue-400'}>[{log.time}]</span> {log.message}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1c1e26] border border-[#2d303a] rounded-lg shadow-xl w-full max-w-lg md:max-w-xl p-5 text-sm max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-semibold mb-4">{editTask ? '编辑任务' : '新建定时任务'}</h3>
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1">任务名称</label>
                <input required name="name" defaultValue={editTask?.name} className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500" />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-zinc-400">运行计划配置 (Cron)</label>
                  <div className="flex bg-[#0f1115] border border-[#2d303a] p-0.5 rounded gap-0.5">
                    <button
                      type="button"
                      onClick={() => setCronMode('visual')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${cronMode === 'visual' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                    >
                      可视化配置
                    </button>
                    <button
                      type="button"
                      onClick={() => setCronMode('raw')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${cronMode === 'raw' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                    >
                      原始表达式
                    </button>
                  </div>
                </div>

                {cronMode === 'visual' ? (
                  <div className="space-y-2">
                    <CronGenerator initialValue={cronValue} onChange={(val) => setCronValue(val)} />
                    <div className="flex items-center gap-1.5 bg-[#15171e] px-2.5 py-1.5 rounded border border-[#2d303a] text-xs font-mono text-zinc-400">
                      <span>生成的 Cron 表达式:</span>
                      <span className="text-blue-400 font-bold">{cronValue}</span>
                    </div>
                    <input type="hidden" name="cron" value={cronValue} />
                  </div>
                ) : (
                  <div>
                    <input
                      required
                      name="cron"
                      value={cronValue}
                      onChange={(e) => setCronValue(e.target.value)}
                      placeholder="例如: */5 * * * *"
                      className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500 font-mono text-sm"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">格式: [分] [时] [日] [月] [周]</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">执行脚本/命令</label>
                <input required name="script" defaultValue={editTask?.script} placeholder="python main.py / sh script.sh" className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500 font-mono text-sm" />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">脚本运行目录 (CWD)</label>
                <input name="cwd" defaultValue={editTask?.cwd || ''} placeholder="如 C:\my_project 或 D:\workspace\app (留空表示当前应用根目录)" className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500 text-sm" />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">局部自定义环境变量</label>
                <textarea name="envVars" defaultValue={editTask?.envVars || ''} rows={3} placeholder="每行一个 KEY=VALUE&#10;例如:&#10;PATH=C:\Python39;C:\Python39\Scripts;$PATH&#10;MY_SYS_KEY=some_value" className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500 font-mono text-xs placeholder:text-zinc-600" />
                <p className="text-[10px] text-zinc-500 mt-1">
                  在此处通过设置 <code className="text-zinc-300 font-mono">PATH=特定路径;$PATH</code> 即可让当前脚本使用特定 Python 版本、Git 路径等。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 mb-1">超时时间 (秒)</label>
                  <input name="timeout" type="number" min="0" placeholder="0 表示不限时" defaultValue={editTask?.timeout || ''} className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500 font-mono text-sm" />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">失败重试次数</label>
                  <input name="retryCount" type="number" min="0" placeholder="默认 1" defaultValue={editTask?.retryCount !== undefined ? editTask.retryCount : 1} className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500 font-mono text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="enabled" id="enabled" defaultChecked={editTask ? editTask.enabled : true} />
                <label htmlFor="enabled" className="text-zinc-400 cursor-pointer">启用此任务</label>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded text-zinc-300 hover:bg-[#2d303a]">取消</button>
                <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1c1e26] border border-[#2d303a] rounded-lg shadow-xl w-full max-w-md p-5 text-sm">
            <h3 className="text-white font-semibold mb-4">系统设置</h3>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1">全局脚本运行编码 (解决乱码)</label>
                <select name="encoding" defaultValue={settings.encoding || 'utf8'} className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500">
                  <option value="utf8">UTF-8 (推荐, Git Bash等默认)</option>
                  <option value="gbk">GBK (部分 Windows CMD 脚本默认)</option>
                </select>
                <p className="text-[10px] text-zinc-500 mt-1">如果输出内容出现“瀹氭椂鍣”说明应该是 UTF-8；如果是繁体生僻字或问号可能是 GBK。</p>
              </div>
              <div className="border-t border-[#2d303a] my-3 pt-3"></div>
              <div>
                <label className="block text-zinc-400 mb-1">自定义环境路径 (追加至 PATH)</label>
                <div className="text-[10px] text-zinc-500 mb-2">
                  如果在执行时提示“找不到某命令”，请尝试在此填入其所在目录。
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] text-zinc-400">Git Bash (sh.exe) 所在目录:</label>
                    <input name="shPath" defaultValue={settings.shPath} placeholder="C:\Program Files\Git\bin" className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-1.5 text-white outline-none focus:border-blue-500 mt-1" />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400">Python (python.exe) 所在目录:</label>
                    <input name="pythonPath" defaultValue={settings.pythonPath} placeholder="C:\Python311 或者 C:\Users\xxx\AppData\Local\Programs\Python\Python311" className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-1.5 text-white outline-none focus:border-blue-500 mt-1" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button type="button" onClick={() => setShowSettingsModal(false)} className="px-4 py-2 rounded text-zinc-300 hover:bg-[#2d303a] transition-colors">取消</button>
                <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors">保存设置</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {historyTask && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1c1e26] border border-[#2d303a] rounded-lg shadow-xl w-full max-w-4xl p-5 flex flex-col h-[80vh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">任务执行日志 - {historyTask.name}</h3>
              <button onClick={() => setHistoryTask(null)} className="text-zinc-400 hover:text-white">关闭 / Esc</button>
            </div>
            <div className="flex-1 overflow-auto bg-[#0f1115] border border-[#2d303a] rounded p-2">
              <div className="space-y-4">
                {taskLogs.length === 0 && <p className="text-zinc-500 text-center mt-10">暂无执行记录</p>}
                {taskLogs.map((log, idx) => (
                  <div key={idx} className="bg-[#15171e] border border-[#2d303a] rounded p-3">
                    <div className="flex items-center gap-4 text-xs font-mono mb-2 border-b border-[#2d303a] pb-2">
                      <span className="text-zinc-400">时间: {log.startTime}</span>
                      <span className="text-zinc-400">耗时: {log.duration}s</span>
                      <span className={log.status === 'SUCCESS' ? 'text-green-400' : 'text-red-400'}>状态: {log.status}</span>
                    </div>
                    <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap overflow-auto max-h-[300px]">
                      {log.log || '无日志输出'}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
