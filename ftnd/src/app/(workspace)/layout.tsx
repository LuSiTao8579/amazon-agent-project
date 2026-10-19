import WorkspaceShell from '@/components/workspace-shell';
import { currentUser } from '@/lib/auth-server';

// Shared workspace layout for /dashboard, /company, /order, and /user.
// Individual pages call requireUser() so unauthenticated requests emit a single
// redirect to /login and client-side tab switches still verify the session.
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) return children;
  return <WorkspaceShell user={user}>{children}</WorkspaceShell>;
}
