---
title: Script Versioning
description: Understanding deployment versions and rollback
social_image: /og-images/docs/concepts/versioning.png
---

## Version Model

Every deployment creates a new immutable version:

```
Version 1 → Version 2 → Version 3
  (v1.0)     (v1.1)      (v2.0)
```

Each version is:
- **Immutable** - Cannot be changed after creation
- **Timestamped** - Creation time recorded
- **Attributed** - Creator tracked
- **Described** - Optional deployment message

## Creating Versions

### Via CLI

```bash
devicesdk deploy --message "Add temperature sensor support"
```

This creates a new version with your message.

### Automatic Versioning

DeviceSDK automatically assigns version identifiers:
- Incrementing version numbers
- SHA-256 content hash
- Timestamp

## Deployment Process

When you deploy:

1. **Build** - Code compiled and bundled
2. **Upload** - Sent to DeviceSDK
3. **Validate** - Checked for errors
4. **Activate** - Made available globally
5. **Notify** - Devices informed of new version

Deployment typically completes in 10-30 seconds.

## Version Activation

### All Devices (Default)

All devices get new version immediately:
```bash
devicesdk deploy
```

## Rollback

Need to revert to a previous version?

### Via Dashboard

1. Navigate to version history
2. Select previous version
3. Click "Rollback"
4. Confirm rollback

Devices reconnect and receive the previous version.

## CI/CD Integration

### GitHub Actions

```yaml
- name: Deploy
  env:
    DEVICESDK_TOKEN: ${{ secrets.DEVICESDK_TOKEN }}
  run: |
    VERSION=$(git describe --tags)
    npx @devicesdk/cli deploy --message "Release $VERSION"
```

## Version Limits

- **Maximum versions**: Last 10 versions per device
- **Retention**: Forever (unless deleted or expired after 10 new versions)
- **Script size**: 1 MB per version

## Next Steps

- [Platform Architecture](/docs/concepts/architecture/) - System overview
- [CLI Deploy Command](/docs/cli/deploy/) - Deployment options
- [Your First Device](/docs/first-device/) - Build and deploy
