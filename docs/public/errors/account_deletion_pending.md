---
title: 'Error: account_deletion_pending'
description: A deletion has been scheduled for this account; data will be removed soon.
social_image: /og-images/docs/errors/account_deletion_pending.png
---

## What it means

The account owner has requested account deletion. DeviceSDK enters a grace period before the deletion finalises (visible to the user as the number of days remaining in the error message). During this window the account is read-only — you can't deploy, flash, or change anything.

## What to do

Email <support@devicesdk.com> if you want to cancel the deletion. Reference your account email and we'll roll it back; the account becomes fully usable again immediately.

If the deletion was intentional and you want to confirm finalisation, no action is required — the account and its data will be removed automatically once the grace window elapses.
