#!/bin/sh

GEO_SITE_PATH=/usr/share/v2ray/geosite.dat
GEO_IP_PATH=/usr/share/v2ray/geoip.dat

extract() {
  local path
  local type="$1"
  path="$(getGeoPath "$1")"
  shift
  geoview -type "$type" -action extract -input "$path" -list "$@" | tr 'A-Z' 'a-z'
}

lookup() {
  local path
  path="$(getGeoPath "$1")"
  geoview -type "$1" -action lookup -input "$path" -value "$2" | tr 'A-Z' 'a-z'
}

getGeoPath() {
  case $1 in
  geosite)
    echo $GEO_SITE_PATH
    ;;
  geoip)
    echo $GEO_IP_PATH
    ;;
  esac
}

main() {
  local action="$1"
  shift
  case $action in
  -e | --extract)
    extract "$@"
    ;;
  -l | --lookup)
    lookup "$@"
    ;;
  *)
    echo "Usage: $0 [-e|--extract] [-l|--lookup]"
    ;;
  esac
}

main "$@"
