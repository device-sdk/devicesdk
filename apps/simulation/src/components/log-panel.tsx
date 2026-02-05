'use client';

import type { LogEntry } from '@/lib/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface LogPanelProps {
  logs: LogEntry[];
}

export default function LogPanel({ logs }: LogPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold mb-2 px-1">Event Log</h2>
      <ScrollArea className="flex-grow rounded-md border p-4 bg-muted/20">
        <div className="space-y-4">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet. Interact with a pin to start.</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex gap-4 text-sm animate-in fade-in">
                <span className="font-mono text-muted-foreground">{log.timestamp}</span>
                <Separator orientation="vertical" className="h-auto" />
                <span className="flex-1 text-foreground">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
