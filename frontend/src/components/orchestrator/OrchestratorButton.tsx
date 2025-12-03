import { Link } from 'react-router-dom';
import { Wand2 } from 'lucide-react';
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

interface OrchestratorButtonProps {
  projectId: string;
  className?: string;
}

export function OrchestratorButton({
  projectId,
  className,
}: OrchestratorButtonProps) {
  // Query orchestrator status to show if it's running
  const { data: orchestrator } = useQuery({
    queryKey: ['orchestrator', projectId],
    queryFn: () => orchestratorApi.get(projectId),
    refetchInterval: 5000, // Poll for status updates
    staleTime: 2000,
  });

  const isRunning =
    orchestrator?.latest_process?.status === 'running';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-9 w-9 relative', className)}
            asChild
            aria-label="Global Orchestrator"
          >
            <Link to={`/projects/${projectId}/orchestrator`}>
              <Wand2 className="h-4 w-4" />
              {isRunning && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {isRunning ? 'Orchestrator (running)' : 'Global Orchestrator'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
