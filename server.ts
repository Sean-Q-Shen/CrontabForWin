import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import { exec } from 'child_process';
import path from 'path';
import cron from 'node-cron';
import { createServer as createViteServer } from 'vite';
import os from 'os';
import iconv from 'iconv-lite';
import { CronExpressionParser } from 'cron-parser';

const TASKS_FILE = path.join(process.cwd(), 'tasks.json');
const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');
const HISTORY_FILE = path.join(process.cwd(), 'history.json');

// In-memory active cron jobs { id: Task }
const activeCrons = new Map();
// In-memory latest logs
const memoryLogs = [];
// In-memory task history { taskId: [] }
let taskHistory: Record<string, any[]> = {};

function addLog(taskId, message, type = 'info') {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const log = { id: Date.now() + Math.random(), taskId, time, message, type };
    memoryLogs.push(log);
    if (memoryLogs.length > 500) memoryLogs.shift();
    console.log(`[${time}] [Task ${taskId}] ${type.toUpperCase()}: ${message}`);
}

async function getHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf-8');
        taskHistory = JSON.parse(data);
    } catch (err) {
        taskHistory = {};
    }
    return taskHistory;
}

let isSavingHistory = false;
async function saveHistory() {
    while(isSavingHistory) {
        await new Promise(r => setTimeout(r, 50));
    }
    isSavingHistory = true;
    try {
        await fs.writeFile(HISTORY_FILE, JSON.stringify(taskHistory, null, 2));
    } catch (err) {
        console.error('Failed to save history', err);
    } finally {
        isSavingHistory = false;
    }
}

function addTaskHistory(taskId, record) {
    if (!taskHistory[taskId]) taskHistory[taskId] = [];
    taskHistory[taskId].unshift(record); // Add to beginning
    if (taskHistory[taskId].length > 50) taskHistory[taskId].length = 50; // Keep last 50
    saveHistory();
}

let isSaving = false;
async function saveTasks(tasks) {
    // Simple lock to avoid race conditions when writing file
    while(isSaving) {
        await new Promise(r => setTimeout(r, 50));
    }
    isSaving = true;
    try {
        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
    } finally {
        isSaving = false;
    }
}

async function getTasks() {
    try {
        const data = await fs.readFile(TASKS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            const initial = [
                { id: 1, status: 'IDLE', name: 'Test_Echo', cron: '*/1 * * * *', script: 'echo "Hello from CronWin"', lastRun: '--', type: 'shell', enabled: true },
            ];
            await saveTasks(initial);
            return initial;
        }
        throw err;
    }
}

async function getSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        // Default settings
        return {
            shPath: '',
            pythonPath: '',
            encoding: 'utf8'
        };
    }
}

async function saveSettings(settings) {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function updateTaskStatus(taskId, status, lastRun = null, lastStatus = null) {
    getTasks().then(tasks => {
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx > -1) {
            tasks[idx].status = status;
            if (lastRun) tasks[idx].lastRun = lastRun;
            if (lastStatus) tasks[idx].lastStatus = lastStatus;
            saveTasks(tasks).catch(console.error);
        }
    }).catch(console.error);
}

async function executeTask(task, retryAttempt = 0) {
    if (retryAttempt === 0) {
        addLog(task.id, `Starting task: ${task.name} (${task.script})`);
        updateTaskStatus(task.id, 'RUNNING');
    } else {
        addLog(task.id, `Retrying task: ${task.name} (Attempt ${retryAttempt}/${task.retryCount})`, 'info');
    }
    
    const startTime = Date.now();

    const settings = await getSettings();
    const customEnvironment = { ...process.env };
    
    const pathsToAdd = [];
    if (settings.shPath) pathsToAdd.push(settings.shPath);
    if (settings.pythonPath) pathsToAdd.push(settings.pythonPath);
    if (settings.envPath) pathsToAdd.push(settings.envPath); // Backwards compatibility
    
    if (pathsToAdd.length > 0) {
        const separator = os.platform() === 'win32' ? ';' : ':';
        customEnvironment.PATH = pathsToAdd.join(separator) + separator + (process.env.PATH || '');
    }

    // Apply task-specific environment variables
    if (task.envVars && typeof task.envVars === 'string') {
        const lines = task.envVars.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue; // Skip empty lines and comments
            const equalIdx = trimmed.indexOf('=');
            if (equalIdx > 0) {
                const key = trimmed.substring(0, equalIdx).trim();
                let val = trimmed.substring(equalIdx + 1).trim();
                
                // Allow appending to PATH via $PATH or %PATH% placeholder
                if (key.toUpperCase() === 'PATH') {
                    const originalPath = customEnvironment.PATH || process.env.PATH || '';
                    val = val.replace('$PATH', originalPath).replace('%PATH%', originalPath);
                }
                
                customEnvironment[key] = val;
            }
        }
    }

    // Force Python and other tools to output matching the selected encoding
    if (settings.encoding === 'gbk') {
        customEnvironment.PYTHONIOENCODING = 'gbk';
        if (!customEnvironment.LANG) customEnvironment.LANG = 'zh_CN.GBK';
    } else {
        customEnvironment.PYTHONIOENCODING = 'utf-8';
        if (!customEnvironment.LANG) customEnvironment.LANG = 'zh_CN.UTF-8';
    }

    const timeoutMs = (task.timeout ? parseInt(task.timeout) : 0) * 1000;

    const execOptions: any = {
        shell: true,
        encoding: 'buffer',
        env: customEnvironment,
        timeout: timeoutMs,
        windowsHide: true
    };

    if (task.cwd && typeof task.cwd === 'string' && task.cwd.trim()) {
        execOptions.cwd = task.cwd.trim();
        addLog(task.id, `Set execution working directory (CWD): ${execOptions.cwd}`, 'info');
    }

    // Windows cmd defaults to GBK/CP936, returning raw buffer allows us to decode safely.
    exec(task.script, execOptions, (error, stdoutBuffer, stderrBuffer) => {
        let stdoutStr = '';
        let stderrStr = '';
        
        if (settings.encoding === 'gbk') {
            stdoutStr = stdoutBuffer ? iconv.decode(stdoutBuffer, 'cp936') : '';
            stderrStr = stderrBuffer ? iconv.decode(stderrBuffer, 'cp936') : '';
        } else {
            // Default to utf-8
            stdoutStr = stdoutBuffer ? iconv.decode(stdoutBuffer, 'utf-8') : '';
            stderrStr = stderrBuffer ? iconv.decode(stderrBuffer, 'utf-8') : '';
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (stdoutStr) addLog(task.id, `stdout: ${stdoutStr.trim()}`, 'info');
        if (stderrStr) addLog(task.id, `stderr: ${stderrStr.trim()}`, 'error');
        
        const nowStr = new Date().toLocaleString('sv-SE', { timeZoneName: 'short' });
        
        if (error) {
            let errorMsg = (error.killed && error.signal) ? `Killed by signal ${error.signal} (Timeout?)` : `Exited with error code: ${error.code}`;
            addLog(task.id, `${errorMsg} (Duration: ${duration}s)`, 'error');
            
            const maxRetries = task.retryCount !== undefined ? parseInt(task.retryCount) : 1;
            if (retryAttempt < maxRetries) {
                addLog(task.id, `Task failed or timed out. Will retry in 2 seconds...`, 'error');
                setTimeout(() => {
                    executeTask(task, retryAttempt + 1);
                }, 2000); // 2 second delay before retry
                return; // Do not record history / update status to FAILED yet
            }

            updateTaskStatus(task.id, task.enabled ? 'IDLE' : 'DISABLED', nowStr, 'FAILED');
            const record = { startTime: nowStr, duration, log: '', status: 'FAILED' };
            record.log = (stderrStr || '') + '\n' + errorMsg + '\n' + (error.message || '');
            addTaskHistory(task.id, record);
        } else {
            addLog(task.id, `Completed successfully (Duration: ${duration}s)`, 'success');
            updateTaskStatus(task.id, task.enabled ? 'IDLE' : 'DISABLED', nowStr, 'SUCCESS');
            const record = { startTime: nowStr, duration, log: '', status: 'SUCCESS' };
            record.log = stdoutStr || stderrStr || 'No output';
            addTaskHistory(task.id, record);
        }
    });
}

function scheduleTask(task) {
    if (!task.enabled) return;
    
    if (activeCrons.has(task.id)) {
        activeCrons.get(task.id).stop();
    }
    
    if (cron.validate(task.cron)) {
        const job = cron.schedule(task.cron, () => {
            executeTask(task);
        });
        activeCrons.set(task.id, job);
    } else {
        addLog(task.id, `Invalid cron expression: ${task.cron}`, 'error');
        updateTaskStatus(task.id, 'FAILED');
    }
}

async function initScheduler() {
    await getHistory();
    const tasks = await getTasks();
    tasks.forEach(task => {
        if (task.enabled) {
            scheduleTask(task);
            if(task.status !== 'FAILED') updateTaskStatus(task.id, 'IDLE');
        } else {
            updateTaskStatus(task.id, 'DISABLED');
        }
    });
}

async function startServer() {
    const app = express();
    const PORT = 3000;

    app.use(cors());
    app.use(express.json());

    // API Routes
    app.get('/api/settings', async (req, res) => {
        try {
            const settings = await getSettings();
            res.json(settings);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.put('/api/settings', async (req, res) => {
        try {
            await saveSettings(req.body);
            res.json(req.body);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/tasks', async (req, res) => {
        try {
            const tasks = await getTasks();
            const enhancedTasks = tasks.map(t => {
                if (t.enabled && t.cron && cron.validate(t.cron)) {
                    try {
                        const interval = CronExpressionParser.parse(t.cron);
                        t.nextRun = interval.next().toDate().toLocaleString('sv-SE', { timeZoneName: 'short' });
                    } catch (e) {
                        t.nextRun = '--';
                    }
                } else {
                    t.nextRun = '--';
                }
                return t;
            });
            res.json(enhancedTasks);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/tasks/:id/history', async (req, res) => {
        try {
            const taskId = req.params.id;
            res.json(taskHistory[taskId] || []);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/tasks', async (req, res) => {
        try {
            const tasks = await getTasks();
            const newTask = {
                id: Date.now(),
                status: req.body.enabled ? 'IDLE' : 'DISABLED',
                name: req.body.name,
                cron: req.body.cron,
                script: req.body.script,
                type: req.body.type || 'shell',
                enabled: req.body.enabled !== false,
                lastRun: '--',
                timeout: req.body.timeout !== undefined ? req.body.timeout : 0,
                retryCount: req.body.retryCount !== undefined ? req.body.retryCount : 1,
                cwd: req.body.cwd !== undefined ? req.body.cwd : '',
                envVars: req.body.envVars !== undefined ? req.body.envVars : ''
            };
            tasks.push(newTask);
            await saveTasks(tasks);
            scheduleTask(newTask);
            res.json(newTask);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/tasks/import', async (req, res) => {
        try {
            const imported = req.body;
            if (!Array.isArray(imported)) {
                return res.status(400).json({ error: '数据格式不正确，应该为数组。' });
            }
            const currentTasks = await getTasks();
            const newTasks = [];
            for (const item of imported) {
                const newId = Date.now() + Math.floor(Math.random() * 1000000);
                const newTask = {
                    id: newId,
                    status: item.enabled !== false ? 'IDLE' : 'DISABLED',
                    name: item.name || '导入的任务',
                    cron: item.cron || '*/5 * * * *',
                    script: item.script || 'echo "hello"',
                    type: item.type || 'shell',
                    enabled: item.enabled !== false,
                    lastRun: item.lastRun || '--',
                    timeout: item.timeout !== undefined ? parseInt(item.timeout) : 0,
                    retryCount: item.retryCount !== undefined ? parseInt(item.retryCount) : 1,
                    cwd: item.cwd !== undefined ? item.cwd : '',
                    envVars: item.envVars !== undefined ? item.envVars : ''
                };
                currentTasks.push(newTask);
                newTasks.push(newTask);
            }
            await saveTasks(currentTasks);
            for (const t of newTasks) {
                if (t.enabled) {
                    scheduleTask(t);
                }
            }
            res.json({ success: true, count: imported.length, tasks: newTasks });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    app.put('/api/tasks/:id', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            let tasks = await getTasks();
            const index = tasks.findIndex(t => t.id === taskId);
            if (index === -1) return res.status(404).json({ error: 'Not found' });
            
            tasks[index] = { ...tasks[index], ...req.body };
            tasks[index].status = tasks[index].enabled ? 'IDLE' : 'DISABLED';
            
            await saveTasks(tasks);
            
            if (activeCrons.has(taskId)) {
                activeCrons.get(taskId).stop();
                activeCrons.delete(taskId);
            }
            
            if (tasks[index].enabled) {
                scheduleTask(tasks[index]);
            }
            
            res.json(tasks[index]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/tasks/:id/run', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            const tasks = await getTasks();
            const task = tasks.find(t => t.id === taskId);
            if (!task) return res.status(404).json({ error: 'Not found' });
            
            executeTask(task);
            res.json({ message: 'Started' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.delete('/api/tasks/:id', async (req, res) => {
        try {
            const taskId = parseInt(req.params.id);
            let tasks = await getTasks();
            tasks = tasks.filter(t => t.id !== taskId);
            await saveTasks(tasks);
            
            if (activeCrons.has(taskId)) {
                activeCrons.get(taskId).stop();
                activeCrons.delete(taskId);
            }
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/logs', (req, res) => {
        res.json(memoryLogs);
    });

    app.delete('/api/logs', (req, res) => {
        memoryLogs.length = 0;
        res.json({ success: true });
    });

    // Vite middleware for development & Static files in production
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
            server: { middlewareMode: true },
            appType: "spa",
        });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
        initScheduler();
    });
}

startServer();
