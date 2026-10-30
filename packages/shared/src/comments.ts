import { z } from 'zod';

// Comments on episodes (SPEC L, ADR-0061). Used by the mobile app and the admin; not the portal.

export const COMMENT_MAX_LENGTH = 1000;
/** Reports from different users that hide a comment until an admin looks. */
export const COMMENT_AUTO_HIDE_REPORTS = 3;
export const COMMENT_PAGE_SIZE = 20;

export const commentStatusSchema = z.enum(['VISIBLE', 'HIDDEN', 'DELETED']);
export type CommentStatus = z.infer<typeof commentStatusSchema>;
export const commentReportReasonSchema = z.enum(['SPAM', 'ABUSE', 'OTHER']);
export type CommentReportReason = z.infer<typeof commentReportReasonSchema>;

export const commentBodySchema = z.string().trim().min(1).max(COMMENT_MAX_LENGTH);

export const commentSchema = z.object({
  id: z.string(),
  /** "Бат Э.": first name and the first letter of the last name. Never a username or email. */
  authorName: z.string(),
  authorId: z.string(),
  body: z.string(),
  mine: z.boolean(),
  edited: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type CommentDto = z.infer<typeof commentSchema>;

export const listCommentsQuerySchema = z.object({
  cursor: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(COMMENT_PAGE_SIZE),
});
export const commentsPageSchema = z.object({
  items: z.array(commentSchema),
  nextCursor: z.string().nullable(),
  /** All comments this viewer can see on the episode (same filter as the list), on every page. */
  total: z.number().int().min(0),
  /** Posting is allowed: active access or a free episode, and the user is not muted. */
  canComment: z.boolean(),
});
export type CommentsPage = z.infer<typeof commentsPageSchema>;

export const createCommentRequestSchema = z.object({ body: commentBodySchema });
export const updateCommentRequestSchema = z.object({ body: commentBodySchema });
export const commentResponseSchema = z.object({ comment: commentSchema });
export const commentParamsSchema = z.object({ id: z.string().min(1).max(64) });
export const reportCommentRequestSchema = z.object({ reason: commentReportReasonSchema });

export const blockedUserSchema = z.object({ id: z.string(), name: z.string() });
export const blockedUsersResponseSchema = z.object({ users: z.array(blockedUserSchema) });
export const blockParamsSchema = z.object({ userId: z.string().min(1).max(64) });

// ---- Admin ----

export const adminCommentFilterSchema = z.enum(['REPORTED', 'HIDDEN', 'VISIBLE', 'DELETED']);
export type AdminCommentFilter = z.infer<typeof adminCommentFilterSchema>;

export const adminCommentSchema = z.object({
  id: z.string(),
  body: z.string(),
  status: commentStatusSchema,
  episode: z.object({ id: z.string(), title: z.string() }),
  author: z.object({
    id: z.string(),
    username: z.string(),
    name: z.string(),
    muted: z.boolean(),
  }),
  reportCount: z.number().int().nonnegative(),
  reasons: z.array(commentReportReasonSchema),
  hiddenBy: z.string().nullable(),
  edited: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type AdminCommentDto = z.infer<typeof adminCommentSchema>;
export const adminCommentResponseSchema = z.object({ comment: adminCommentSchema });

export const listAdminCommentsQuerySchema = z.object({
  /** Default REPORTED: visible comments somebody reported, most reports first. */
  filter: adminCommentFilterSchema.default('REPORTED'),
  q: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(1).max(100).optional(),
  ),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListAdminCommentsQuery = z.infer<typeof listAdminCommentsQuerySchema>;
export const adminCommentsPageSchema = z.object({
  items: z.array(adminCommentSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const muteUserResponseSchema = z.object({ muted: z.boolean() });
