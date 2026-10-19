import { redirect } from 'next/navigation';
import { routes, type WorkspaceSection } from '@/config/routes';
import { currentUser } from '@/lib/auth-server';
import WorkspacePreview from './workspace-preview';

// Each page verifies the cookie with Nest; a shared layout alone is not a guard.
export default async function AuthenticatedWorkspace({ section }: { section: WorkspaceSection }) {
  const user = await currentUser();
  if (!user) redirect(routes.login);
  return <WorkspacePreview section={section} user={user} />;
}
