import { AuthenticatedContext } from './context.ts';

export async function verifyProjectOwnership(ctx: AuthenticatedContext, projectId: string) {
  // Since ctx.client is configured with the user's JWT and RLS is enabled, 
  // it will automatically return exactly 0 rows if the project isn't owned by this user.
  const { data: project, error } = await ctx.client
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    ctx.logger.error('verification.project_not_found_or_forbidden', { projectId, userId: ctx.user.id });
    throw new Error('FORBIDDEN_OR_NOT_FOUND');
  }

  return project;
}

export async function verifyBusinessOwnership(ctx: AuthenticatedContext, businessId: string) {
  // Again, RLS handles the validation.
  const { data: business, error } = await ctx.client
    .from('businesses')
    .select('id, name, project_id, status')
    .eq('id', businessId)
    .single();

  if (error || !business) {
    ctx.logger.error('verification.business_not_found_or_forbidden', { businessId, userId: ctx.user.id });
    throw new Error('FORBIDDEN_OR_NOT_FOUND');
  }

  return business;
}
