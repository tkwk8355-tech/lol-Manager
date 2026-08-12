#!/bin/bash
set -e
tar -xzf ~/deploy.tar.gz
npm install --production
pm2 restart lolclanManager
