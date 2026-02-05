
'use client';

import type { PinType } from '@/lib/types';
import Pin from './pin';

interface PicoBoardProps {
  pins: PinType[];
  onPinUpdate: (pin: PinType) => void;
}

export default function PicoBoard({ pins, onPinUpdate }: PicoBoardProps) {
  const ledPin = pins.find(p => p.id === 99)!;
  
  const leftPins = pins.filter(p => p.position.left !== undefined && p.id !== 99).sort((a, b) => a.id - b.id);
  const rightPins = pins.filter(p => p.position.right !== undefined && p.id !== 99).sort((a, b) => b.id - a.id);

  return (
    <div className="bg-[#2A563F] w-auto h-auto rounded-lg shadow-lg border-2 border-[#1E3C2C] p-4 flex flex-row items-center justify-center gap-2">
      {/* Left Pins Column */}
      <div className="flex flex-col gap-y-[3px]">
        {leftPins.map((pin) => (
          <Pin key={pin.id} pin={pin} onUpdate={onPinUpdate} side="left" />
        ))}
      </div>

      {/* Center Board Column */}
      <div className="w-[150px] h-[500px] flex flex-col justify-between items-center">
        {/* Pico Chip */}
        <div className="w-[90px] h-[90px] bg-gray-700 rounded-sm flex items-center justify-center mt-20">
          <span className="text-white font-bold text-center text-lg leading-tight">Pico 2 W</span>
        </div>
        
        <div className="flex flex-col items-center gap-2">
          {/* LED */}
          <Pin pin={ledPin} onUpdate={onPinUpdate} side="center" />
          {/* USB Port */}
          <div className="w-[35px] h-[12px] bg-gray-400 rounded-sm border border-gray-500" />
        </div>
      </div>

      {/* Right Pins Column */}
       <div className="flex flex-col gap-y-[3px]">
        {rightPins.map((pin) => (
          <Pin key={pin.id} pin={pin} onUpdate={onPinUpdate} side="right" />
        ))}
      </div>
    </div>
  );
}
