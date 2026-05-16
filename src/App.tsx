import React, { useState, useEffect } from 'react';

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
            <button onClick={() => { setEditTask(null); setShowModal(true); }} className="w-full bg-[#0078d4] hover:bg-[#1085e0] text-white py-2 rounded text-sm font-medium flex items-center justify-center gap-2">
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
                <button onClick={fetchTasks} className="bg-[#2d303a] px-3 py-1 rounded text-xs text-white hover:bg-[#3d414f]">刷新</button>
                <button onClick={() => { setEditTask(null); setShowModal(true); }} className="md:hidden bg-[#0078d4] px-3 py-1 rounded text-xs text-white">新建</button>
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
                        <span onClick={() => { setEditTask(task); setShowModal(true); }} className="cursor-pointer hover:underline">编辑</span>
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
          <div className="bg-[#1c1e26] border border-[#2d303a] rounded-lg shadow-xl w-full max-w-md p-5 text-sm">
            <h3 className="text-white font-semibold mb-4">{editTask ? '编辑任务' : '新建定时任务'}</h3>
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-zinc-400 mb-1">任务名称</label>
                <input required name="name" defaultValue={editTask?.name} className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Cron表达式 <span className="text-[10px]">(例如: */5 * * * *)</span></label>
                <input required name="cron" defaultValue={editTask?.cron} className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">执行脚本/命令</label>
                <input required name="script" defaultValue={editTask?.script} placeholder="python main.py / sh script.sh" className="w-full bg-[#0f1115] border border-[#2d303a] rounded px-3 py-2 text-white outline-none focus:border-blue-500" />
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
