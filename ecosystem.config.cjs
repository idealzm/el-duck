module.exports = {
  apps: [
    {
      name: 'el-duck',
      script: 'server/index.js',
      cwd: process.env.EL_DUCK_DIR || __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};