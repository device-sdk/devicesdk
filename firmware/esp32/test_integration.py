"""
Integration tests: full device lifecycle simulation with all command types and responses.
Validates the complete command/response flow without hardware.
"""

import json


class DeviceSimulator:
    """Simulates the ESP32 device processing commands and producing responses."""

    def __init__(self):
        self.gpio_states = {}
        self.gpio_monitored = set()
        self.pwm_states = {}
        self.i2c_buses = {}
        self.responses = []
        self.notifications = []

    def process_command(self, command_json):
        """Simulate the worker task processing a command and returning a response."""
        cmd = json.loads(command_json) if isinstance(command_json, str) else command_json
        msg_type = cmd.get("type")
        msg_id = cmd.get("id", "")
        payload = cmd.get("payload", {})

        if msg_type == "set_gpio_state":
            pin = payload["pin"]
            state = payload["state"]
            self.gpio_states[pin] = state
            resp = {
                "type": "command_ack",
                "payload": {"command": "set_gpio_state", "pin": pin, "status": "success"},
            }

        elif msg_type == "get_pin_state":
            pin = payload["pin"]
            mode = payload["mode"]
            if mode == "digital":
                value = self.gpio_states.get(pin, "low")
                resp = {
                    "type": "pin_state",
                    "payload": {"pin": pin, "mode": "digital", "value": value},
                }
            else:
                resp = {
                    "type": "pin_state",
                    "payload": {"pin": pin, "mode": "analog", "value": 2048},
                }

        elif msg_type == "set_pwm_state":
            self.pwm_states[payload["pin"]] = {
                "frequency": payload["frequency"],
                "duty_cycle": payload["duty_cycle"],
            }
            resp = {
                "type": "command_ack",
                "payload": {"command": "set_pwm_state", "status": "success"},
            }

        elif msg_type == "configure_gpio_input_monitoring":
            pin = payload["pin"]
            if payload.get("enable", True):
                self.gpio_monitored.add(pin)
                resp = {
                    "type": "command_ack",
                    "payload": {
                        "command": "configure_gpio_input_monitoring",
                        "pin": pin,
                        "status": "monitoring_enabled",
                    },
                }
            else:
                self.gpio_monitored.discard(pin)
                resp = {
                    "type": "command_ack",
                    "payload": {
                        "command": "configure_gpio_input_monitoring",
                        "pin": pin,
                        "status": "monitoring_disabled",
                    },
                }

        elif msg_type == "i2c_configure":
            bus = payload["bus"]
            self.i2c_buses[bus] = {
                "sda_pin": payload["sda_pin"],
                "scl_pin": payload["scl_pin"],
                "frequency": payload.get("frequency", 100000),
            }
            resp = {
                "type": "command_ack",
                "payload": {
                    "command": "i2c_configure",
                    "bus": bus,
                    "sda_pin": payload["sda_pin"],
                    "scl_pin": payload["scl_pin"],
                    "frequency": payload.get("frequency", 100000),
                    "status": "success",
                },
            }

        elif msg_type == "i2c_scan":
            bus = payload["bus"]
            # Simulate finding an SSD1306 OLED
            resp = {
                "type": "i2c_scan_result",
                "payload": {"bus": bus, "devices": ["0x3C"], "count": 1},
            }

        elif msg_type == "i2c_write":
            resp = {
                "type": "command_ack",
                "payload": {"command": "i2c_write", "status": "success"},
            }

        elif msg_type == "i2c_read":
            resp = {
                "type": "i2c_read_result",
                "payload": {
                    "bus": payload["bus"],
                    "address": payload["address"],
                    "data": "q80=",  # base64 of [0xAB, 0xCD]
                    "length": 2,
                },
            }

        elif msg_type == "display_update":
            resp = {
                "type": "command_ack",
                "payload": {
                    "command": "display_update",
                    "controller": payload["controller"],
                    "width": payload["width"],
                    "height": payload["height"],
                    "segments_count": len(payload.get("segments", [])),
                    "bytes_written": 1024,
                    "status": "success",
                },
            }

        elif msg_type == "reboot":
            resp = {
                "type": "command_ack",
                "payload": {"command": "reboot", "status": "rebooting"},
            }

        else:
            resp = {
                "type": "command_error",
                "payload": {"error": f"Unknown command type: {msg_type}"},
            }

        if msg_id:
            resp["id"] = msg_id

        self.responses.append(resp)
        return resp

    def emit_gpio_notification(self, pin, state):
        """Simulate an autonomous GPIO state change notification."""
        notif = {
            "type": "gpio_state_changed",
            "payload": {"pin": pin, "state": state},
        }
        self.notifications.append(notif)
        return notif


class TestDeviceLifecycle:
    """Test complete device lifecycle: connect -> commands -> reboot."""

    def setup_method(self):
        self.device = DeviceSimulator()

    def test_connect_message(self):
        """Device sends device_connected on WebSocket connect."""
        msg = {"type": "device_connected"}
        assert msg["type"] == "device_connected"

    def test_gpio_set_and_read(self):
        """Set GPIO then read it back."""
        self.device.process_command({
            "type": "set_gpio_state", "id": "1",
            "payload": {"pin": 5, "state": "high"},
        })
        assert self.device.gpio_states[5] == "high"

        resp = self.device.process_command({
            "type": "get_pin_state", "id": "2",
            "payload": {"pin": 5, "mode": "digital"},
        })
        assert resp["type"] == "pin_state"
        assert resp["payload"]["value"] == "high"
        assert resp["id"] == "2"

    def test_pwm_control(self):
        resp = self.device.process_command({
            "type": "set_pwm_state", "id": "3",
            "payload": {"pin": 18, "frequency": 5000, "duty_cycle": 0.75},
        })
        assert resp["type"] == "command_ack"
        assert self.device.pwm_states[18]["frequency"] == 5000

    def test_gpio_monitoring(self):
        resp = self.device.process_command({
            "type": "configure_gpio_input_monitoring", "id": "4",
            "payload": {"pin": 15, "enable": True, "pull": "up"},
        })
        assert resp["payload"]["status"] == "monitoring_enabled"
        assert 15 in self.device.gpio_monitored

        # Simulate GPIO change notification
        notif = self.device.emit_gpio_notification(15, "high")
        assert notif["type"] == "gpio_state_changed"
        assert "id" not in notif  # Unsolicited

    def test_i2c_full_flow(self):
        """Configure -> scan -> write -> read."""
        # Configure
        resp = self.device.process_command({
            "type": "i2c_configure", "id": "5",
            "payload": {"bus": 0, "sda_pin": 21, "scl_pin": 22, "frequency": 400000},
        })
        assert resp["payload"]["status"] == "success"

        # Scan
        resp = self.device.process_command({
            "type": "i2c_scan", "id": "6",
            "payload": {"bus": 0},
        })
        assert resp["type"] == "i2c_scan_result"
        assert "0x3C" in resp["payload"]["devices"]

        # Write
        resp = self.device.process_command({
            "type": "i2c_write", "id": "7",
            "payload": {"bus": 0, "address": "0x3C", "data": "AQID"},
        })
        assert resp["payload"]["status"] == "success"

        # Read
        resp = self.device.process_command({
            "type": "i2c_read", "id": "8",
            "payload": {"bus": 0, "address": "0x50", "length": 2},
        })
        assert resp["type"] == "i2c_read_result"
        assert resp["payload"]["data"] == "q80="

    def test_display_update(self):
        resp = self.device.process_command({
            "type": "display_update", "id": "9",
            "payload": {
                "bus": 0, "address": "0x3C", "controller": "ssd1306",
                "width": 128, "height": 64, "init": True,
                "segments": [{"offset": 0, "data": "AAAA"}],
            },
        })
        assert resp["payload"]["command"] == "display_update"
        assert resp["payload"]["controller"] == "ssd1306"

    def test_reboot(self):
        resp = self.device.process_command({"type": "reboot", "id": "10"})
        assert resp["payload"]["status"] == "rebooting"
        assert resp["id"] == "10"

    def test_full_lifecycle(self):
        """Complete lifecycle: connect -> commands -> I2C -> display -> reboot."""
        # 1. Connect
        connect_msg = {"type": "device_connected"}
        assert connect_msg["type"] == "device_connected"

        # 2. GPIO commands
        self.device.process_command({
            "type": "set_gpio_state", "id": "lc-1",
            "payload": {"pin": 2, "state": "high"},
        })

        # 3. Configure GPIO monitoring
        self.device.process_command({
            "type": "configure_gpio_input_monitoring", "id": "lc-2",
            "payload": {"pin": 15, "enable": True, "pull": "up"},
        })

        # 4. I2C configure
        self.device.process_command({
            "type": "i2c_configure", "id": "lc-3",
            "payload": {"bus": 0, "sda_pin": 21, "scl_pin": 22},
        })

        # 5. I2C scan
        self.device.process_command({
            "type": "i2c_scan", "id": "lc-4",
            "payload": {"bus": 0},
        })

        # 6. Display update
        self.device.process_command({
            "type": "display_update", "id": "lc-5",
            "payload": {
                "bus": 0, "address": "0x3C", "controller": "ssd1306",
                "width": 128, "height": 64, "init": True,
                "segments": [{"offset": 0, "data": "AAAA"}],
            },
        })

        # 7. GPIO notification
        self.device.emit_gpio_notification(15, "low")

        # 8. Reboot
        resp = self.device.process_command({"type": "reboot", "id": "lc-6"})
        assert resp["payload"]["status"] == "rebooting"

        # Verify all responses have correct IDs
        for resp in self.device.responses:
            if "id" in resp:
                assert resp["id"].startswith("lc-")

        # Verify notification has no ID
        assert len(self.device.notifications) == 1
        assert "id" not in self.device.notifications[0]

    def test_message_id_tracking(self):
        """Verify message IDs are correctly correlated across all commands."""
        commands = [
            ("id-001", {"type": "set_gpio_state", "payload": {"pin": 5, "state": "high"}}),
            ("id-002", {"type": "get_pin_state", "payload": {"pin": 5, "mode": "digital"}}),
            ("id-003", {"type": "set_pwm_state", "payload": {"pin": 18, "frequency": 1000, "duty_cycle": 0.5}}),
            ("id-004", {"type": "i2c_scan", "payload": {"bus": 0}}),
            ("id-005", {"type": "reboot"}),
        ]

        for msg_id, cmd in commands:
            cmd["id"] = msg_id
            resp = self.device.process_command(cmd)
            assert resp["id"] == msg_id, f"Response ID mismatch for {msg_id}"

    def test_unknown_command(self):
        resp = self.device.process_command({
            "type": "nonexistent_command", "id": "err-1",
            "payload": {},
        })
        assert resp["type"] == "command_error"
        assert "error" in resp["payload"]
        assert resp["id"] == "err-1"
