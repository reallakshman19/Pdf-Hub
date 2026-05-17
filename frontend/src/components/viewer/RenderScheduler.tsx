import React from 'react';

/**
 * RenderScheduler is a placeholder component intended to coordinate
 * scheduling of heavy rendering tasks like page rasterisation.  In the
 * preview implementation it simply renders its children immediately.
 * Future implementations may throttle or defer rendering to avoid
 * blocking the main thread.
 */
export const RenderScheduler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};