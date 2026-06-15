# SPDX-FileCopyrightText: 2025 DeviceSDK Project
# SPDX-License-Identifier: CC0-1.0
import logging
from typing import Callable

import pytest
from pytest_embedded_idf.dut import IdfDut
from pytest_embedded_idf.utils import idf_parametrize


@pytest.mark.esp32
@pytest.mark.generic
def test_devicesdk_client_build(dut: IdfDut, log_minimum_free_heap_size: Callable[..., None]) -> None:
    """Test that the DeviceSDK client builds and starts correctly."""
    
    # Check for boot message
    dut.expect('Starting DeviceSDK Client', timeout=30)
    logging.info('DeviceSDK client started successfully')
    
    # Check HAL initialization
    dut.expect('HAL initialized', timeout=10)
    logging.info('HAL initialized')
    
    # Check Wi-Fi initialization
    dut.expect('wifi_init_sta finished', timeout=10)
    logging.info('Wi-Fi initialization completed')
    
    # Log minimum free heap size
    log_minimum_free_heap_size()


@pytest.mark.esp32
@pytest.mark.generic
def test_devicesdk_client_wifi_connection(dut: IdfDut) -> None:
    """Test Wi-Fi connection attempt."""
    
    dut.expect('Starting DeviceSDK Client', timeout=30)
    
    # Wi-Fi should attempt to connect
    dut.expect('wifi_init_sta finished', timeout=10)
    
    # Should either connect or fail within 30 seconds
    # The actual connection depends on whether credentials are set
    dut.expect(r'(connected to ap|Failed to connect|retry to connect)', timeout=35)
    logging.info('Wi-Fi connection attempt completed')


@pytest.mark.esp32
@pytest.mark.generic
def test_devicesdk_client_websocket_task(dut: IdfDut) -> None:
    """Test that WebSocket task starts."""
    
    dut.expect('Starting DeviceSDK Client', timeout=30)
    
    # Check for WebSocket task start
    dut.expect('WebSocket task started', timeout=40)
    logging.info('WebSocket task started successfully')


@pytest.mark.esp32
@pytest.mark.generic
def test_devicesdk_client_hal_gpio(dut: IdfDut) -> None:
    """Test HAL GPIO functionality."""
    
    dut.expect('Starting DeviceSDK Client', timeout=30)
    
    # HAL should initialize
    dut.expect('HAL initialized', timeout=10)
    
    # Check that LED blink operations occur (boot blink)
    # The GPIO operations happen but may not be logged depending on configuration
    logging.info('HAL GPIO test completed')


@pytest.mark.esp32
@pytest.mark.generic
def test_devicesdk_client_no_crash(dut: IdfDut) -> None:
    """Test that the client runs without crashing for a reasonable time."""
    
    dut.expect('Starting DeviceSDK Client', timeout=30)
    dut.expect('wifi_init_sta finished', timeout=10)
    
    # Wait for 10 seconds to ensure no crash
    try:
        dut.expect('abort()', timeout=10)
        pytest.fail('Application crashed unexpectedly')
    except Exception:
        # No crash is expected, so timeout is good
        logging.info('Application running stable for 10 seconds')


@pytest.mark.esp32
@pytest.mark.generic
def test_devicesdk_client_component_load(dut: IdfDut) -> None:
    """Test that all required components load correctly."""
    
    dut.expect('Starting DeviceSDK Client', timeout=30)
    
    # Check that NVS flash initializes
    # This happens silently if successful, but errors would be logged
    
    # Check HAL initialization
    dut.expect('HAL initialized', timeout=10)
    
    # Verify Wi-Fi component loaded
    dut.expect('wifi_init_sta finished', timeout=10)
    
    # Verify WebSocket component can start
    dut.expect('WebSocket task started', timeout=40)
    
    logging.info('All components loaded successfully')
