---
title: devicesdk deploy
description: Deploy device scripts to the DeviceSDK server you run
social_image: /og-images/docs/cli/deploy.png
---

## Usage

```bash
devicesdk deploy [flags]
```

## Flags

- `--device <name>` - Deploy specific device only
- `--message <text>` - Deployment message for version history
- `--dry-run` - Preview deployment without actually deploying

## Description

The deploy command:
1. Builds your device scripts
2. Uploads them to your server
3. Creates a new immutable version
4. Makes it available to devices

Your scripts run on the DeviceSDK server you host. Devices on your LAN connect to it over WebSocket.

## Deployment Process

When you deploy:

1. **Build** - Code is compiled and optimized
2. **Upload** - Scripts are sent to your server
3. **Activate** - New version becomes active
4. **Notify** - Connected devices reconnect to the new version
5. **Publish entity declarations** - If any device defines `ha.entities` in `devicesdk.ts`, those declarations are uploaded so the [Home Assistant integration](/docs/guides/home-assistant/) can discover them.

## Examples

Deploy all devices:
```bash
devicesdk deploy
```

Deploy specific device:
```bash
devicesdk deploy --device temperature-sensor
```

Deploy with message:
```bash
devicesdk deploy --message "Fix temperature reading bug"
```

Dry run (preview without deploying):
```bash
devicesdk deploy --dry-run
```

## Version History

Each deployment creates a new immutable version. View version history in the dashboard your server serves.

### Deployment Messages

Add messages to track changes:
```bash
devicesdk deploy --message "Add humidity sensor support"
```

These appear in your version history and help track what changed.

## Deployment Strategies

### All-at-Once (Default)
All devices get the new version immediately:
```bash
devicesdk deploy
```

### Per-Device
Deploy devices independently:
```bash
devicesdk deploy --device sensor-1
devicesdk deploy --device sensor-2
```

### Staged Rollout
Deploy to a subset of devices first, then expand (via the dashboard).

## Rollback

Need to revert? Rollback in the dashboard:
1. View version history
2. Select previous version
3. Click "Rollback"

Devices reconnect to the previous version.

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
      
      - name: Deploy
        env:
          DEVICESDK_API_URL: ${{ secrets.DEVICESDK_API_URL }}
          DEVICESDK_TOKEN: ${{ secrets.DEVICESDK_TOKEN }}
        run: npx @devicesdk/cli deploy --message "Deploy from CI"
```

### GitLab CI

```yaml
deploy:
  script:
    - npx @devicesdk/cli deploy --message "Deploy from CI"
  only:
    - main
```

## Environment Variables

Set `DEVICESDK_TOKEN` for CI/CD:

```bash
export DEVICESDK_API_URL="http://<server>:8080"
export DEVICESDK_TOKEN="dsdk_…"
devicesdk deploy
```

Get your token from the dashboard your server serves, under the *Tokens* page.

## Deployment Limits

- Maximum script size: 1MB
- Build timeout: 5 minutes
- Concurrent deployments: 1 per project

## Troubleshooting

**Authentication failed?**

Your session may have expired. Re-authenticate with:
```bash
devicesdk login
```
If using an API token, verify it's still valid in your dashboard's *Tokens* page.

**Build fails?**

Fix TypeScript errors before deploying:
```bash
npm run build
```
Common causes: missing imports, type errors in your entrypoint class, or an entrypoint name that doesn't match the exported class.

**Deployment stuck?**

Check the dashboard for deployment status and error details. If a deployment appears hung, try deploying again — only one deployment per project runs at a time, and the previous one will be superseded.

**Need to rollback?**

Open the device in the dashboard and select a previous version to redeploy. You can also redeploy from the CLI:
```bash
devicesdk deploy --version <version-id>
```

## Best Practices

1. **Test locally first** - Validate your project before deploying
2. **Add deployment messages** - Track what changed
3. **Deploy incrementally** - Start with one device, expand gradually
4. **Monitor after deploy** - Watch logs in dashboard
5. **Have a rollback plan** - Know how to revert if needed
