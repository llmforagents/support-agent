// SQL imports are bundled as text strings via wrangler's `[[rules]]` block
// in production and via vitest-pool-workers' bundled vite plugin in tests.
// The `?raw` declaration is kept for any legacy importer that may still
// add the suffix; the plain `.sql` declaration is what `d1Migrations.ts`
// currently uses.
declare module '*.sql' {
  const content: string
  export default content
}

declare module '*.sql?raw' {
  const content: string
  export default content
}
