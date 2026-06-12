---
title: Troubleshooting
description: Common issues and solutions for DeviceSDK
social_image: /og-images/docs/resources/troubleshooting.png
---

## CLI Issues

### Authentication Failed

**Symptom**: `devicesdk login` fails or shows "Unauthorized"

**Solutions**:
1. Clear existing credentials and log in again, pointing at your server:
   ```bash
   devicesdk logout
   devicesdk login --host http://<server>:8080
   ```

2. Check that your server is reachable (e.g. open `http://<server>:8080` in a browser, or `curl http://<server>:8080/health`)

3. Verify you're using the latest CLI:
   ```bash
   npx @devicesdk/cli@latest --version
   ```

### Command Not Found

**Symptom**: `devicesdk: command not found`

**Solutions**:
1. Use npx directly:
   ```bash
   npx @devicesdk/cli [command]
   ```

2. Install globally:
   ```bash
   npm install -g @devicesdk/cli
   ```

3. Check Node.js version (requires 22+):
   ```bash
   node --version
   ```

### Build Failures

**Symptom**: `devicesdk build` fails with TypeScript errors

**Solutions**:
1. Check TypeScript errors:
   ```bash
   npx tsc --noEmit
   ```

2. Verify all imports are correct

3. Ensure `devicesdk.ts` config is valid

4. Clear build cache:
   ```bash
   rm -rf .devicesdk/
   devicesdk build
   ```

### Deploy Failures

**Symptom**: Deploy command fails or times out

**Solutions**:
1. Ensure you're authenticated:
   ```bash
   devicesdk whoami
   ```

2. Check build completes successfully:
   ```bash
   devicesdk build
   ```

3. Verify network connectivity

4. Check dashboard for deployment status

## Device Connection Issues

### Device Won't Connect

**Symptom**: Device offline in dashboard

**Solutions**:
1. **Check WiFi credentials**
   - Verify SSID and password
   - Ensure 2.4GHz network (5GHz not supported)

2. **Verify firmware**
   - Re-flash device: `devicesdk flash`
   - Check LED indicators

3. **Network requirements**
   - WebSocket (port 443) must be allowed
   - No captive portal on WiFi
   - Check firewall rules

4. **Check device logs**
   - View in dashboard
   - Look for connection errors

### Frequent Disconnections

**Symptom**: Device connects then disconnects repeatedly

**Solutions**:
1. **Check WiFi signal strength**
   - Move device closer to router
   - Reduce interference

2. **Power supply**
   - Ensure stable power source
   - USB power must provide adequate current

3. **Code issues**
   - Check for crashes in device logs
   - Look for exceptions in `onDeviceConnect`

### Device Connects but Doesn't Respond

**Symptom**: Device shows online but doesn't handle messages

**Solutions**:
1. Check `onMessage` handler is implemented

2. Verify message types match:
   ```typescript
   // Edge script sends this type
   { type: 'gpio_write', ... }
   
   // Device must handle this type
   ```

3. Look for errors in device logs

4. Test with simulator first

## Hardware Issues

### GPIO Not Working

**Symptom**: Pin doesn't respond to commands

**Solutions**:
1. **Check pin number**
   - Verify correct GPIO number (not physical pin)
   - Example: GPIO 25, not Pin 25

2. **Pin configuration**
   - Ensure pin is configured as output/input
   - Check for conflicting configuration

3. **Hardware check**
   - Test with multimeter
   - Check for shorts
   - Verify connections

### ADC Readings Incorrect

**Symptom**: Analog readings are wrong or unstable

**Solutions**:
1. **Pin verification**
   - Use ADC-capable pins only (GP26, GP27, GP28)
   
2. **Voltage range**
   - Input must be 0-3.3V
   - Use voltage divider for higher voltages

3. **Grounding**
   - Ensure common ground
   - Check for ground loops

4. **Calibration**
   - Take multiple readings and average
   - Account for voltage reference variations

### I2C Not Working

**Symptom**: I2C sensor not responding

**Solutions**:
1. **Wiring check**
   - SDA and SCL connected correctly
   - Pull-up resistors present (4.7kΩ typical)
   - Common ground

2. **Address verification**
   - Use I2C scanner to find device address
   - Check sensor datasheet

3. **Power**
   - Sensor has adequate power
   - Correct voltage level (3.3V vs 5V)

## Flashing Issues

### Device Not Detected in BOOTSEL Mode

**Symptom**: `devicesdk flash` can't find device

**Solutions**:
1. **Enter BOOTSEL mode correctly**:
   - Disconnect USB
   - Hold BOOTSEL button
   - Connect USB while holding
   - Release button
   - Device appears as "RPI-RP2" drive

2. **USB cable**
   - Must support data (not power-only)
   - Try different cable

3. **USB port**
   - Try different USB port
   - Some hubs don't work well

### Flash Fails Partway Through

**Symptom**: Flashing starts but fails to complete

**Solutions**:
1. **Don't disconnect** during flash

2. **Clean flash**:
   - Download flash_nuke.uf2 from Raspberry Pi
   - Copy to BOOTSEL drive to erase completely
   - Re-flash DeviceSDK firmware

3. **Check disk space** on host computer

## Performance Issues

### High Latency

**Symptom**: Messages take long time to arrive

**Solutions**:
1. Check network latency (ping test)

2. Verify edge location is close to device

3. Reduce message size

4. Check for network congestion

### Message Loss

**Symptom**: Messages not received reliably

**Solutions**:
1. Implement acknowledgments for critical messages

2. Check message size (must be < 64KB)

3. Verify stable connection

4. Look for errors in logs

## Development Issues

### Simulator Not Starting

**Symptom**: `devicesdk dev` fails to start

**Solutions**:
1. **Port in use**:
   ```bash
   devicesdk dev --port 3001
   ```

2. **Check for errors** in terminal output

3. **Clear cache**:
   ```bash
   rm -rf .devicesdk/
   ```

### Hot Reload Not Working

**Symptom**: Changes don't apply automatically

**Solutions**:
1. Check for TypeScript errors in terminal

2. Restart dev server

3. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)

## Error Messages

### "Rate limit exceeded"

**Cause**: Too many requests too quickly

**Solution**: Wait a moment and retry. For production, implement backoff.

### "Script execution timeout"

**Cause**: Code takes too long to execute

**Solutions**:
- Optimize code performance
- Offload heavy work to queues
- Reduce message processing time

### "Invalid device credentials"

**Cause**: Device authentication failed

**Solution**: Re-flash device with `devicesdk flash`

## Getting Help

If you're still stuck:

1. **Check logs**
   - Device logs in dashboard
   - Script logs in dashboard
   - CLI output

2. **Join Discord**
   - [DeviceSDK Community](https://discord.gg/WuNhbXGsBy)
   - Share error messages and logs

3. **GitHub Issues**
   - Search existing issues
   - Create new issue with details

4. **Documentation**
   - [FAQ](/docs/resources/faq/)
   - [CLI Reference](/docs/cli/)
   - [Concepts](/docs/concepts/architecture/)

## Debugging Tips

### Enable Verbose Logging

```bash
devicesdk deploy --verbose
```

### Check System Status

Verify DeviceSDK services are operational:
- [Status page](https://status.devicesdk.com)

### Isolate the Problem

1. Test with simulator first
2. Try minimal code example
3. Test individual components
4. Check one thing at a time

### Collect Information

When reporting issues, include:
- CLI version
- Error messages
- Code snippet
- Device logs
- Steps to reproduce
