import React from 'react';
import { Button } from '@/components/ui/Button';
import { ScanText, ServerCog } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useCapabilities } from '@/core/capabilities/useCapabilities';

export const ToolbarOcr: React.FC = () => {
  const capabilities = useCapabilities();

  return (
    <div className="flex items-center space-x-1 border-r border-slate-200 dark:border-slate-800 pr-2 mr-2">
      <Tooltip content="Run local OCR">
        <Button variant="ghost" size="sm" className="h-8 text-xs font-medium">
          <ScanText className="w-4 h-4 mr-2" />
          OCR
        </Button>
      </Tooltip>
      
      {capabilities?.mode === 'server' && (
        <Tooltip content="Server OCR Pipeline">
          <Button data-testid="toolbar-btn-server-ocr" variant="ghost" size="sm" className="h-8 text-xs font-medium">
            <ServerCog className="w-4 h-4 mr-2 text-blue-500" />
            Server OCR
          </Button>
        </Tooltip>
      )}
    </div>
  );
};
