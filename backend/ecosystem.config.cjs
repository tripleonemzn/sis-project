const DEFAULT_INSTANCES = 2;
const MAX_INSTANCES = 8;

function resolveInstances() {
  const rawValue = Number.parseInt(process.env.PM2_INSTANCES || '', 10);
  if (!Number.isFinite(rawValue) || rawValue < 2) return DEFAULT_INSTANCES;
  return Math.min(rawValue, MAX_INSTANCES);
}

module.exports = {
  apps: [
    {
      name: 'sis-backend',
      cwd: '/var/www/sis-project/backend',
      script: 'dist/src/index.js',
      exec_mode: 'cluster',
      instances: resolveInstances(),
      max_memory_restart: '600M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Jakarta',
      },
    },
  ],
};
