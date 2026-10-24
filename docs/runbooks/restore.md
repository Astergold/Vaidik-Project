# Database Restore Runbook

## Overview

This runbook covers the procedure to restore the PostgreSQL 17 database from Cloudflare R2 backups (nightly base + WAL).

## Restore Drill Log

- **Date:** 2026-10-06
- **Status:** Script created. Awaiting Cloudflare R2 credentials from Vaidik (Task D1-V-03) to run the first live drill against the bucket.
- **Verification Target:** Restored DB must successfully spin up in a scratch container and return the test row.

## Manual Execution Steps

1. Ensure R2 variables (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) are exported in your environment.
2. Execute the restore script: `./infra/backup/restore.sh`
3. Verify the script outputs a successful test row query before the container cleans itself up.
