'use strict';
const path = require('node:path');
const os = require('node:os');
function dataDirectory(env = process.env, platform = process.platform, homedir = os.homedir()) {
  // This override is intentional same-user process configuration, not an input
  // accepted by MCP or the loopback API. The app validates the resulting private
  // directory at startup before accessing fixed settings/control filenames.
  if (env.MADCAT_HOME) return path.resolve(env.MADCAT_HOME);
  const base = platform === 'win32' ? env.APPDATA || path.join(homedir, 'AppData', 'Roaming')
    : platform === 'darwin' ? path.join(homedir, 'Library', 'Application Support')
    : env.XDG_CONFIG_HOME || path.join(homedir, '.config');
  return path.join(base, 'mini-mad-cat-companion');
}
module.exports = { dataDirectory };
