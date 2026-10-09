'use strict';
const { statSync } = require('node:fs');
const { isAbsolute } = require('node:path');

function localDockerOptions(env = process.env, stat = statSync) {
  const socket = env.DAPPGO_UPGRADE_DRILL_SOCKET || '/var/run/docker.sock';
  if (!isAbsolute(socket) || socket.includes('\0') || !stat(socket).isSocket()) {
    throw new Error('local_docker_socket_required');
  }
  const sanitized = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/^DOCKER_(HOST|CONTEXT|TLS|TLS_VERIFY|CERT_PATH)$/.test(key)));
  return { args: ['--host', 'unix://' + socket], env: sanitized };
}

function ownedContainer(current, name, label, owner) {
  return current?.Name === '/' + name && current?.Config?.Labels?.[label] === owner;
}
module.exports = { localDockerOptions, ownedContainer };
