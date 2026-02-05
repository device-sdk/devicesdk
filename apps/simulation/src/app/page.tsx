'use client';

import { useState, useCallback } from 'react';
import type { PinType, LogEntry, ConnectedSensor } from '@/lib/types';
import { pinsData } from '@/lib/pins';
import Header from '@/components/header';
import PicoBoard from '@/components/pico/pico-board';
import LogPanel from '@/components/log-panel';
import VirtualSensorConnector from '@/components/virtual-sensor-connector';
import { Card, CardContent } from '@/components/ui/card';

export default function Home() {
  const [selectedDevice, setSelectedDevice] = useState('PicoW-A');
  const [pins, setPins] = useState<PinType[]>(pinsData);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connectedSensors, setConnectedSensors] = useState<ConnectedSensor[]>([]);

  const addLog = useCallback((message: string) => {
    const newLog: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message,
    };
    setLogs((prevLogs) => [newLog, ...prevLogs]);
  }, []);

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId);
    setPins(pinsData); // Reset pins to default state
    setLogs([]); // Clear logs
    setConnectedSensors([]); // Clear sensors
    addLog(`Switched to device: ${deviceId}. Board reset.`);
  };

  const handlePinUpdate = (updatedPin: PinType) => {
    const oldPin = pins.find(p => p.id === updatedPin.id);
    
    setPins((currentPins) =>
      currentPins.map((pin) => (pin.id === updatedPin.id ? updatedPin : pin))
    );

    if (oldPin) {
      if (oldPin.mode !== updatedPin.mode) {
        addLog(`Pin ${updatedPin.name} (GPIO ${updatedPin.gpio}) mode set to ${updatedPin.mode}.`);
      }
      if (oldPin.state !== updatedPin.state) {
        addLog(`Pin ${updatedPin.name} (GPIO ${updatedPin.gpio}) state set to ${updatedPin.state}.`);
      }
    }
  };
  
  const handleConnectSensor = (sensor: ConnectedSensor) => {
    // Prevent connecting the same sensor type multiple times for simplicity
    if (connectedSensors.some(s => s.type === sensor.type)) {
      addLog(`Sensor ${sensor.type} is already connected. Disconnect it first.`);
      return;
    }
    setConnectedSensors(prev => [...prev, sensor]);
    addLog(`Connected ${sensor.type} to pins: ${Object.values(sensor.pins).join(', ')}.`);
  };
  
  const handleDisconnectSensor = (sensorType: string) => {
     setConnectedSensors(prev => prev.filter(s => s.type !== sensorType));
     addLog(`Disconnected ${sensorType}.`);
  };

  return (
    <div className="flex flex-col h-screen bg-background font-body">
      <Header
        selectedDevice={selectedDevice}
        onDeviceChange={handleDeviceChange}
      />
      <main className="flex-grow grid md:grid-cols-2 gap-8 p-4 md:p-8 overflow-hidden">
        <div className="flex items-center justify-center h-full overflow-hidden">
          <PicoBoard pins={pins} onPinUpdate={handlePinUpdate} />
        </div>
        <div className="flex flex-col gap-8 h-full overflow-hidden">
          <VirtualSensorConnector 
            pins={pins} 
            connectedSensors={connectedSensors}
            onConnectSensor={handleConnectSensor}
            onDisconnectSensor={handleDisconnectSensor}
            addLog={addLog}
          />
          <Card className="flex-grow flex flex-col h-full overflow-hidden">
            <CardContent className="p-4 flex-grow overflow-hidden">
              <LogPanel logs={logs} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
