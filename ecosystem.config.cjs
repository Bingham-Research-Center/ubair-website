const { execSync } = require('child_process');

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

const branch = currentBranch();

module.exports = {
  apps: [
    {
      name: `basinwx-${branch}`,
      script: 'server/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: branch === 'ops' ? 'production' : 'development',
      },
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 5000,
      time: true,
    },
  ],
};
