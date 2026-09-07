#!/bin/bash
set -e
git pull origin main
npm install
npm run build
pm2 restart lolclanManager
