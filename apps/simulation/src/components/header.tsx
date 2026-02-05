'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GitBranch } from 'lucide-react';

interface HeaderProps {
  selectedDevice: string;
  onDeviceChange: (deviceId: string) => void;
}

export default function Header({ selectedDevice, onDeviceChange }: HeaderProps) {
  const devices = ['PicoW-A', 'PicoW-B', 'PicoW-C'];

  return (
    <header className="flex items-center justify-between p-4 border-b bg-card">
      <div className="flex items-center gap-2">
         <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-primary"
          >
            <path d="M5.5 13.5A3.5 3.5 0 0 1 2 10V8.5A3.5 3.5 0 0 1 5.5 5h1.052a3.5 3.5 0 0 1 3.203 2.22L11 11l-1.245 3.78a3.5 3.5 0 0 1-3.203 2.22H5.5Z" />
            <path d="M18.5 13.5a3.5 3.5 0 0 0 3.5-3.5V8.5a3.5 3.5 0 0 0-3.5-3.5h-1.052a3.5 3.5 0 0 0-3.203 2.22L13 11l1.245 3.78a3.5 3.5 0 0 0 3.203 2.22H18.5Z" />
          </svg>
        <h1 className="text-xl font-bold font-headline">DeviceSDK</h1>
      </div>
      <div className="w-48">
        <Select value={selectedDevice} onValueChange={onDeviceChange}>
          <SelectTrigger>
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              <SelectValue placeholder="Select Device" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {devices.map((device) => (
              <SelectItem key={device} value={device}>
                {device}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
