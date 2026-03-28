import { Router } from 'express';
import { requireActor } from '../middleware/actor.middleware.js';
import type { AuthMiddlewares } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { validateQuery } from '../middleware/validateQuery.middleware.js';
import { createPostsController } from '../controllers/posts.controller.js';
import type { AppServices } from '../types/api-deps.js';
import { createCommentSchema } from '../validators/comment.validator.js';
import {
  createPostSchema,
  feedQuerySchema,
  leaderConcernsQuerySchema,
  listPostsQuerySchema,
  resolvePostSchema,
  trendingQuerySchema,
} from '../validators/post.validator.js';
import { votePostSchema } from '../validators/vote.validator.js';

export function createPostsRouter(auth: AuthMiddlewares, services: AppServices) {
  const router = Router();
  const c = createPostsController(services);

  router.get('/feed', validateQuery(feedQuerySchema), c.feedNearby);
  router.get(
    '/leaders/me/concerns',
    auth.requireAuth,
    validateQuery(leaderConcernsQuerySchema),
    c.listLeaderConcerns,
  );
  router.get('/posts/trending', validateQuery(trendingQuerySchema), c.trendingPosts);
  router.get('/posts', validateQuery(listPostsQuerySchema), c.listPosts);
  router.post(
    '/posts',
    auth.optionalAuth,
    requireActor,
    validateBody(createPostSchema),
    c.createPost,
  );
  router.get('/posts/:id', c.getPost);
  router.post(
    '/posts/:id/view',
    auth.optionalAuth,
    requireActor,
    c.recordView,
  );
  router.get('/posts/:id/comments', c.listComments);
  router.post(
    '/posts/:id/comments',
    auth.optionalAuth,
    requireActor,
    validateBody(createCommentSchema),
    c.createComment,
  );
  router.post(
    '/posts/:id/vote',
    auth.optionalAuth,
    requireActor,
    validateBody(votePostSchema),
    c.votePost,
  );
  router.post(
    '/posts/:id/resolve',
    auth.requireAuth,
    validateBody(resolvePostSchema),
    c.resolvePost,
  );

  router.get('/leaders/:leaderId/accountability', c.getAccountability);
  router.post(
    '/leaders/:leaderId/accountability/refresh',
    auth.requireAuth,
    auth.requireRoles('admin', 'super_admin'),
    c.refreshAccountability,
  );

  return router;
}
