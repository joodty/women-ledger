#!/data/data/com.termux/files/usr/bin/sh
export HOME=/data/data/com.termux/files/home
export PREFIX=/data/data/com.termux/files/usr
"$PREFIX/bin/termux-wake-lock"
nohup "$PREFIX/bin/node" "$HOME/women-ledger/supervisor.cjs" >> "$HOME/women-ledger/supervisor.log" 2>&1 </dev/null &
nohup "$PREFIX/bin/node" "$HOME/women-ledger/release-updater.cjs" >> "$HOME/women-ledger/release-updater.log" 2>&1 </dev/null &
