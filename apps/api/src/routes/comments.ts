import type { FastifyInstance } from 'fastify';
import {
  blockParamsSchema,
  blockedUsersResponseSchema,
  commentParamsSchema,
  commentResponseSchema,
  commentsPageSchema,
  createCommentRequestSchema,
  episodeParamsSchema,
  listCommentsQuerySchema,
  reportCommentRequestSchema,
  updateCommentRequestSchema,
} from '@ongod/shared';
import { authOf, type createAuthGuard } from '../auth/guard';
import type { CommentService } from '../comments/service';

/**
 * Comments on episodes (SPEC L, ADR-0061). Every route needs a signed-in user with an ACTIVE
 * profile. Reading is open to every signed-in user; posting needs what playing needs (the
 * service decides). Responses are per user (blocks, `mine`), so they are never cached.
 */
export async function commentRoutes(
  app: FastifyInstance,
  opts: { comments: CommentService; requireAuth: ReturnType<typeof createAuthGuard> },
) {
  const { comments } = opts;
  app.addHook('preHandler', opts.requireAuth);
  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'private, no-store');
  });

  app.get('/episodes/:id/comments', async (req) => {
    const { id } = episodeParamsSchema.parse(req.params);
    const query = listCommentsQuerySchema.parse(req.query);
    return commentsPageSchema.parse(await comments.list(authOf(req).user, id, query));
  });

  app.post('/episodes/:id/comments', async (req, reply) => {
    const { id } = episodeParamsSchema.parse(req.params);
    const { body } = createCommentRequestSchema.parse(req.body);
    const comment = await comments.create(authOf(req).user, id, body);
    return reply.code(201).send(commentResponseSchema.parse({ comment }));
  });

  app.patch('/comments/:id', async (req) => {
    const { id } = commentParamsSchema.parse(req.params);
    const { body } = updateCommentRequestSchema.parse(req.body);
    return commentResponseSchema.parse({
      comment: await comments.update(authOf(req).user, id, body),
    });
  });

  app.delete('/comments/:id', async (req, reply) => {
    const { id } = commentParamsSchema.parse(req.params);
    await comments.remove(authOf(req).user, id);
    return reply.code(204).send();
  });

  app.post('/comments/:id/report', async (req, reply) => {
    const { id } = commentParamsSchema.parse(req.params);
    const { reason } = reportCommentRequestSchema.parse(req.body);
    await comments.report(authOf(req).user, id, reason);
    return reply.code(204).send();
  });

  app.post('/comments/:id/block', async (req, reply) => {
    const { id } = commentParamsSchema.parse(req.params);
    await comments.blockAuthorOf(authOf(req).user, id);
    return reply.code(204).send();
  });

  app.get('/me/blocks', async (req) =>
    blockedUsersResponseSchema.parse({ users: await comments.blocks(authOf(req).user) }),
  );

  app.delete('/me/blocks/:userId', async (req, reply) => {
    const { userId } = blockParamsSchema.parse(req.params);
    await comments.unblock(authOf(req).user, userId);
    return reply.code(204).send();
  });
}
