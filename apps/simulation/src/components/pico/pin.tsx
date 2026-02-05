'use client';

import type { PinType } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

interface PinProps {
  pin: PinType;
  onUpdate: (pin: PinType) => void;
  side: 'left' | 'right' | 'center';
}

export default function Pin({ pin, onUpdate, side }: PinProps) {
  const isGpio = pin.gpio !== null;
  const isPowerOrGnd = pin.name.includes('3V3') || pin.name.includes('GND') || pin.name.includes('VBUS') || pin.name.includes('VSYS');
  const isLed = pin.id === 99;

  const handleModeChange = (isOutput: boolean) => {
    onUpdate({ ...pin, mode: isOutput ? 'OUTPUT' : 'INPUT' });
  };
  
  const handleStateChange = (isHigh: boolean) => {
    onUpdate({ ...pin, state: isHigh ? 'HIGH' : 'LOW', value: isHigh ? 1 : 0 });
  };

  const popoverContent = (
    <div className="p-4 w-64 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-bold">{pin.name}</h4>
        {isGpio && <Badge variant="secondary">GPIO {pin.gpio}</Badge>}
      </div>
      <Separator />
      <div className="space-y-2">
        <p className="text-sm font-medium">Functions:</p>
        <div className="flex flex-wrap gap-1">
          {pin.functions.length > 0 ? (
            pin.functions.map((func) => (
              <Badge key={func} variant="outline">
                {func}
              </Badge>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">General Purpose I/O</p>
          )}
        </div>
      </div>
      {(isGpio || isLed) && !isPowerOrGnd && (
        <>
        <Separator />
        <div className="space-y-4">
            {!isLed && (
              <div className="flex items-center justify-between">
                  <Label htmlFor={`mode-switch-${pin.id}`}>Mode: {pin.mode}</Label>
                  <Switch 
                      id={`mode-switch-${pin.id}`}
                      checked={pin.mode === 'OUTPUT'}
                      onCheckedChange={handleModeChange}
                      aria-label={`Toggle pin ${pin.gpio} mode`}
                  />
              </div>
            )}
            <div className="flex items-center justify-between">
                <Label htmlFor={`state-switch-${pin.id}`} className={cn(pin.mode === 'INPUT' && !isLed && 'text-muted-foreground')}>State: {pin.state}</Label>
                <Switch 
                    id={`state-switch-${pin.id}`}
                    checked={pin.state === 'HIGH'}
                    onCheckedChange={handleStateChange}
                    disabled={pin.mode === 'INPUT' && !isLed}
                    aria-label={`Toggle pin ${pin.gpio || 'LED'} state`}
                />
            </div>
        </div>
        </>
      )}
    </div>
  );

  const pinHole = (
     <div
      className={cn(
        'w-3 h-3 rounded-full border-2 border-gray-500 transition-colors',
        isGpio ? 'bg-yellow-400' : 'bg-gray-600',
        (!isPowerOrGnd || isLed) && 'cursor-pointer group-hover:ring-2 ring-primary',
        isLed && 'bg-green-900',
        isLed && pin.state === 'HIGH' && 'bg-green-400 shadow-[0_0_10px_2px_rgba(134,239,172,0.7)]'
      )}
    />
  );

  if (isLed) {
    return (
       <Popover>
        <PopoverTrigger asChild>
          <button
            className="group flex flex-col items-center gap-1"
            aria-label={`Pin ${pin.id} ${pin.name}`}
            disabled={!isGpio && !isLed || isPowerOrGnd}
          >
            {pinHole}
            <span className="text-xs text-background font-mono group-hover:text-primary transition-colors">
              {pin.name}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center">{popoverContent}</PopoverContent>
      </Popover>
    );
  }
  
  const pinContent = (
    <div className={cn('flex items-center gap-2 group',
      side === 'left' ? 'flex-row-reverse justify-end' : 'flex-row justify-start'
    )}>
      <span className="text-xs text-white font-mono transition-colors group-hover:text-primary w-5 text-center">{pin.id}</span>
      {pinHole}
    </div>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button disabled={!isGpio || isPowerOrGnd}>
          {pinContent}
        </button>
      </PopoverTrigger>
      {(!isPowerOrGnd) && <PopoverContent align={side === 'left' ? 'end' : 'start'}>{popoverContent}</PopoverContent>}
    </Popover>
  );
}
