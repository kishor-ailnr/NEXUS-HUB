import React from 'react';
import { UserLocationBadge } from './UserLocationBadge';

export interface MiniMapProps {
  latitude?: number | null;
  longitude?: number | null;
  orgName?: string;
  className?: string;
}

export const MiniMap: React.FC<MiniMapProps> = ({
  latitude,
  longitude,
  orgName,
  className = '',
}) => {
  const hasCoordinates =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) &&
    !isNaN(longitude);

  return (
    <div data-testid={hasCoordinates ? 'mini-map' : undefined} className="flex items-center">
      <UserLocationBadge
        className={className}
        fallbackLatitude={latitude}
        fallbackLongitude={longitude}
        fallbackOrgName={orgName}
      />
    </div>
  );
};
