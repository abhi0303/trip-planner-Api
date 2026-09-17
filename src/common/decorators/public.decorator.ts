import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as callable without a token. A valid token is still decoded
 * when present, so public endpoints can tailor results to the viewer
 * (visibility rules, `isLiked`, `isFollowing`).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
