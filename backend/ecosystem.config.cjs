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
        SBTS_LOAD_TEST_BYPASS_ENABLED: process.env.SBTS_LOAD_TEST_BYPASS_ENABLED || 'false',
        SBTS_LOAD_TEST_BYPASS_SECRET: process.env.SBTS_LOAD_TEST_BYPASS_SECRET || '',
        SBTS_LOAD_TEST_BYPASS_ACADEMIC_YEAR_ID: process.env.SBTS_LOAD_TEST_BYPASS_ACADEMIC_YEAR_ID || '',
        SBTS_LOAD_TEST_BYPASS_SEMESTER: process.env.SBTS_LOAD_TEST_BYPASS_SEMESTER || '',
      },
    },
  ],
};
