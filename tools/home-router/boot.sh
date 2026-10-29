#!/bin/sh
# Optional HBC init.d entry. Its absence is the installation default.
set -eu
umask 077
exec /usr/bin/node /var/lib/quiet-home-router/router.cjs boot </dev/null >/dev/null 2>&1 &
