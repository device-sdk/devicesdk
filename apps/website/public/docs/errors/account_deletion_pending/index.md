---
title: "Error: account_deletion_pending"
description: "A deletion has been scheduled for this account; data will be removed soon."
---

# Error: account_deletion_pending

> A deletion has been scheduled for this account; data will be removed soon.


## What it means

The account owner has requested account deletion. DeviceSDK enters a grace period before the deletion finalises (visible to the user as the number of days remaining in the error message). During this window the account is read-only; you can't deploy, flash, or change anything.

## What to do

Because DeviceSDK is self-hosted, account deletion is managed on your own server. If you want to cancel the deletion, contact your server administrator, or, if you are the admin, cancel it by clearing the `deletion_requested_at` field in the `users` table of your `devicesdk.sqlite` database.

If the deletion was intentional, no action is required; the account and its data will be removed automatically once the grace window elapses.
