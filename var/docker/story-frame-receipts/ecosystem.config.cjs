// Explicit package start scripts preserve dotenv/runtime behavior without root pm2.
const role = process.env.POSTIZ_PROCESS_ROLE || 'all';
if (!['all', 'web', 'orchestrator'].includes(role)) {
  throw new Error('POSTIZ_PROCESS_ROLE must be all, web or orchestrator');
}
const names = role === 'orchestrator'
  ? ['orchestrator']
  : role === 'web' ? ['backend', 'frontend'] : ['backend', 'frontend', 'orchestrator'];
module.exports = {
  apps: names.map((name) => ({
    name,
    cwd: '/app',
    script: '/usr/local/bin/pnpm',
    interpreter: 'none',
    args: ['--filter', `./apps/${name}`, 'run', 'start'],
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
  })),
};
