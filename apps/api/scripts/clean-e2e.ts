// DEV ONLY, one-time: removes the series, lists, tags and categories that old e2e runs left in the
// dev database ("E2E *" names) and the empty "test" category. A dry run unless --apply is given.
// Episodes are only counted, not deleted: their media files live on Bunny and deleting rows here
// would orphan them (delete those in the admin).
//   pnpm --filter @ongod/api clean:e2e            (lists what it would delete)
//   pnpm --filter @ongod/api clean:e2e --apply    (deletes it)
import { createDb } from '../src/db';

if (process.env.NODE_ENV === 'production') {
  console.error('clean:e2e is for local development only.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (copy .env.example to .env).');
  process.exit(1);
}
const apply = process.argv.includes('--apply');

const db = createDb(url);
const e2e = { startsWith: 'E2E' };

const series = await db.series.findMany({
  where: { title: e2e },
  select: { id: true, title: true },
});
const playlists = await db.playlist.findMany({
  where: { title: e2e, isFeatured: false },
  select: { id: true, title: true },
});
const tags = await db.tag.findMany({ where: { name: e2e }, select: { id: true, name: true } });
const categories = await db.category.findMany({
  where: { OR: [{ name: e2e }, { name: 'test' }] },
  select: { id: true, name: true, _count: { select: { episodes: true } } },
});
const removableCategories = categories.filter((c) => c._count.episodes === 0);
const episodes = await db.episode.count({ where: { title: e2e } });

const show = (label: string, names: string[]) =>
  console.log(`${label}: ${names.length}${names.length ? `\n  - ${names.join('\n  - ')}` : ''}`);
show(
  'series',
  series.map((s) => s.title),
);
show(
  'lists',
  playlists.map((p) => p.title),
);
show(
  'tags',
  tags.map((t) => t.name),
);
show(
  'categories',
  removableCategories.map((c) => c.name),
);
for (const c of categories.filter((c) => c._count.episodes > 0)) {
  console.log(`kept category "${c.name}": it still has ${c._count.episodes} episode(s)`);
}
if (episodes) console.log(`NOT deleted: ${episodes} "E2E" episode(s); delete them in the admin.`);

if (!apply) {
  console.log('\nDry run: nothing was deleted. Run again with --apply to delete the rows above.');
} else {
  // Series: episodes keep their row (series is set to null); playlist items and tag links cascade.
  await db.$transaction([
    db.series.deleteMany({ where: { id: { in: series.map((s) => s.id) } } }),
    db.playlist.deleteMany({ where: { id: { in: playlists.map((p) => p.id) } } }),
    db.tag.deleteMany({ where: { id: { in: tags.map((t) => t.id) } } }),
    db.category.deleteMany({ where: { id: { in: removableCategories.map((c) => c.id) } } }),
  ]);
  console.log('\nDeleted.');
}
await db.$disconnect();
