import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { orchestratorApi } from '@/lib/api';
import { cn } from '@/lib/utils';

// Rainbow gradient text component for VIBE
function RainbowVibe({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-bold text-xs bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 bg-clip-text text-transparent',
        className
      )}
      style={{
        backgroundSize: '200% 100%',
      }}
    >
      VIBE
    </span>
  );
}

interface OrchestratorButtonProps {
  projectId: string;
  className?: string;
}

export function OrchestratorButton({
  projectId,
  className,
}: OrchestratorButtonProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Query orchestrator status to show if it's running
  const { data: orchestrator } = useQuery({
    queryKey: ['orchestrator', projectId],
    queryFn: () => orchestratorApi.get(projectId),
    refetchInterval: 5000, // Poll for status updates
    staleTime: 2000,
  });

  const isRunning = orchestrator?.latest_process?.status === 'running';

  const handleClick = () => {
    const params = new URLSearchParams(searchParams);
    params.set('orchestrator', 'open');
    setSearchParams(params);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-9 px-2 relative', className)}
            onClick={handleClick}
            aria-label="Global Orchestrator"
          >
            <RainbowVibe />
            {isRunning && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isRunning ? 'Orchestrator (running)' : 'Global Orchestrator'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
