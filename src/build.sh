#!/bin/sh
# assemble: build.sh <page-name> <body-file> > out.html   (one-off helper, not a repo build step)
page="$1"; body="$2"
hdr=$(cat "$(dirname "$0")/header.html")
for p in services demos pricing; do
  if [ "$p" = "$page" ]; then hdr=$(printf '%s' "$hdr" | sed "s/{{CUR_$p}}/ aria-current=\"page\"/"); else hdr=$(printf '%s' "$hdr" | sed "s/{{CUR_$p}}//"); fi
done
cat "$body.head"
printf '%s\n' "$hdr"
cat "$body"
cat "$(dirname "$0")/footer.html"
