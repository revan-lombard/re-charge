#!/usr/bin/env bash
# Cloudflare Pages build: copy only the public website into ./public.
# Cloudflare settings: Build command `bash scripts/cf-build.sh`, Build output directory `public`.
# Internal notes, sources, the backend and the office-PC kit never leave the repo.
set -euo pipefail
rm -rf public && mkdir public
tar -cf - \
  --exclude='./.git' --exclude='./public' --exclude='./node_modules' \
  --exclude='./src' --exclude='./scripts' --exclude='./supabase' --exclude='./hub' --exclude='./backend' --exclude='./_build' \
  --exclude='*.md' --exclude='./_config.yml' --exclude='./CNAME' --exclude='./.gitignore' --exclude='./.gitattributes' --exclude='./undefined' \
  . | tar -xf - -C public
echo "public/: $(find public -type f | wc -l) files"
