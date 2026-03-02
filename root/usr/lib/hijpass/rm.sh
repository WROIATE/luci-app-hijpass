#!/bin/sh

case "$1" in
  "proxy")
    rm -f /etc/hijpass/client/*-$2.json
    ;;
  "server")
    rm -f /etc/hijpass/server/*-$2.json
    ;;
esac