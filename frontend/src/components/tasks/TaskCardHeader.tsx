import type { ReactNode } from 'react';
import { UserAvatar } from './UserAvatar';

interface HeaderAvatar {
  firstName?: string;
  lastName?: string;
  username?: string;
  imageUrl?: string;
}

interface TaskCardHeaderProps {
  title: ReactNode;
  subtitle?: string;
  avatar?: HeaderAvatar;
  right?: ReactNode;
  className?: string;
  titleClassName?: string;
}

export function TaskCardHeader({
  title,
  subtitle,
  avatar,
  right,
  className,
  titleClassName,
}: TaskCardHeaderProps) {
  return (
    <div className={`flex items-start gap-3 min-w-0 ${className ?? ''}`}>
      <h4
        className={`flex-1 min-w-0 line-clamp-2 font-light text-sm ${titleClassName ?? ''}`}
      >
        {avatar ? (
          <UserAvatar
            firstName={avatar.firstName}
            lastName={avatar.lastName}
            username={avatar.username}
            imageUrl={avatar.imageUrl}
            className="mr-2 inline-flex align-middle h-5 w-5"
          />
        ) : null}
        <span className="align-middle">{title}</span>
        {subtitle && (
          <span className="align-middle text-muted-foreground ml-2">
            {subtitle}
          </span>
        )}
      </h4>
      {right ? (
        <div className="flex items-center gap-1 shrink-0">{right}</div>
      ) : null}
    </div>
  );
}
