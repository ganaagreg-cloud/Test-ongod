import type { AdminTagDto } from '@ongod/shared';
import { isUniqueViolation } from '../auth/service';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { audit } from './audit';

const LETTERS: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'ye', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
};

/** Mongolian Cyrillic to a Latin slug: lowercase words joined with "-". */
export function slugOf(name: string): string {
  const latin = [...name.toLowerCase()].map((ch) => LETTERS[ch] ?? ch).join('');
  const slug = latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/g, '');
  // slugSchema needs at least 2 characters.
  return slug.length >= 2 ? slug : slug ? `tag-${slug}` : 'tag';
}

/** Admin tags (ADR-0042): free labels on episodes, with a slug derived from the name. */
export function createTagService(deps: { db: Db }) {
  const { db } = deps;

  const dto = (t: {
    id: string;
    name: string;
    slug: string;
    _count: { episodes: number };
  }): AdminTagDto => ({ id: t.id, name: t.name, slug: t.slug, episodeCount: t._count.episodes });

  const load = async (id: string) => {
    const row = await db.tag.findUnique({
      where: { id },
      include: { _count: { select: { episodes: true } } },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND');
    return dto(row);
  };

  /** Same name, ignoring case (the in-memory compare covers collations that are case-sensitive). */
  const nameTaken = async (tx: Pick<Db, 'tag'>, name: string, exceptId?: string) => {
    const found = await tx.tag.findMany({ where: { name } });
    const lower = name.toLocaleLowerCase('mn');
    return found.some((t) => t.id !== exceptId && t.name.toLocaleLowerCase('mn') === lower);
  };

  /** The base slug, or base-2, base-3 ... when another tag already uses it. */
  const freeSlug = async (tx: Pick<Db, 'tag'>, name: string) => {
    const base = slugOf(name);
    for (let n = 1; ; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      if (!(await tx.tag.findUnique({ where: { slug: candidate } }))) return candidate;
    }
  };

  return {
    slugOf,

    async list() {
      const rows = await db.tag.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { episodes: true } } },
      });
      return rows.map(dto);
    },

    async create(actor: User, input: { name: string }) {
      try {
        const id = await db.$transaction(async (tx) => {
          if (await nameTaken(tx, input.name)) throw new AppError(409, 'TAG_TAKEN');
          const slug = await freeSlug(tx, input.name);
          const tag = await tx.tag.create({ data: { name: input.name, slug } });
          await audit(tx, actor.id, 'tag.create', 'Tag', tag.id, { name: input.name, slug });
          return tag.id;
        });
        return await load(id);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'TAG_TAKEN');
        throw err;
      }
    },

    /** The slug stays as it was, so links to the tag keep working. */
    async rename(actor: User, id: string, input: { name: string }) {
      await db.$transaction(async (tx) => {
        if (!(await tx.tag.findUnique({ where: { id } }))) throw new AppError(404, 'NOT_FOUND');
        if (await nameTaken(tx, input.name, id)) throw new AppError(409, 'TAG_TAKEN');
        await tx.tag.update({ where: { id }, data: { name: input.name } });
        await audit(tx, actor.id, 'tag.rename', 'Tag', id, { name: input.name });
      });
      return load(id);
    },

    /** Removes the tag from every episode; the episodes stay. */
    async remove(actor: User, id: string) {
      await db.$transaction(async (tx) => {
        const found = await tx.tag.findUnique({ where: { id } });
        if (!found) throw new AppError(404, 'NOT_FOUND');
        await tx.tag.delete({ where: { id } });
        await audit(tx, actor.id, 'tag.delete', 'Tag', id, { name: found.name });
      });
    },
  };
}

export type TagService = ReturnType<typeof createTagService>;
