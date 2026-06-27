---
title: "Error: account_suspended"
description: "Your DeviceSDK account has been suspended."
---

# Error: account_suspended

> Your DeviceSDK account has been suspended.


## What it means

The account that owns the credentials on the request has been suspended. While suspended, the account cannot deploy scripts, flash devices, or use the API.

## What to do

Because DeviceSDK is self-hosted, account suspension is managed by the server administrator (the person who runs your DeviceSDK instance). Contact your server admin to have the account reinstated or to understand why it was suspended.

If you are the admin and need to reinstate an account, update the `suspended` flag in the `users` table of your `devicesdk.sqlite` database directly.
