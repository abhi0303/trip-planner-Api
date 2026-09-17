import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

/**
 * `@CurrentUser() user: AuthenticatedUser` on protected routes.
 * `@CurrentUser() viewer?: AuthenticatedUser` on @Public routes — undefined when
 * the caller is anonymous.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
