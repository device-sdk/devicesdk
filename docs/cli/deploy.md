---
title: devicesdk deploy
description: Deploy device scripts to production
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
2. Uploads to DeviceSDK
3. Creates a new version
4. Makes it available to devices

Your code is deployed globally to 300+ edge locations for low-latency device communication.

## Deployment Process

When you deploy:

1. **Build** - Code is compiled and optimized
2. **Upload** - Scripts are sent to the edge
3. **Activate** - New version becomes active
4. **Notify** - Connected devices receive update

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

Each deployment creates a new immutable version. View version history in the [dashboard](https://dash.devicesdk.com).

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
Deploy to subset of devices first, then expand (via dashboard).

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
export DEVICESDK_TOKEN="your-token-here"
devicesdk deploy
```

Get your token from the [dashboard](https://dash.devicesdk.com).

## Deployment Limits

- Maximum script size: 1MB
- Build timeout: 5 minutes
- Concurrent deployments: 1 per project

## Troubleshooting

**Authentication failed?**

**Build fails?**

Fix TypeScript errors before deploying:
```bash
npm run build
```

**Deployment stuck?**

Check dashboard for deployment status and error details.

**Need to rollback?**

Use the dashboard to revert to a previous version immediately.

## Best Practices

1. **Test locally first** - Validate your project before deploying
2. **Add deployment messages** - Track what changed
3. **Deploy incrementally** - Start with one device, expand gradually
4. **Monitor after deploy** - Watch logs in dashboard
5. **Have a rollback plan** - Know how to revert if needed
