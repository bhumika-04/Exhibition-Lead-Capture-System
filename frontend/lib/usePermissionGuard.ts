'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, hasPermission } from './auth';

/**
 * Checks auth + permission on mount.
 * - Not authenticated → redirects to /auth/login
 * - Authenticated but missing permission → redirects to /chat (the one page all roles can access)
 * - Returns { allowed } so the page can avoid rendering before redirect.
 *
 * Pass null as permissionKey to require auth only (no permission check).
 */
export function usePermissionGuard(permissionKey: string | null): { allowed: boolean } {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/auth/login');
      return;
    }
    if (permissionKey !== null && !hasPermission(permissionKey)) {
      router.replace('/chat');
      return;
    }
    setAllowed(true);
  }, [router, permissionKey]);

  return { allowed };
}
