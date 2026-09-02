# `src/app/` — routes only

Next's App Router derives every URL from the folder structure **inside this
directory**. A page exists only at `app/**/page.tsx`, an endpoint only at
`app/**/route.ts`. There is no setting that points Next at
`src/restaurants/<name>/page.tsx`, so routes cannot live beside the restaurant
they serve. This directory is a framework requirement, not a design choice.

Every file here is therefore a **thin shim**. No menu data, no components, no
restaurant facts.

## One page, one restaurant per deployment

`page.tsx` is a switch and nothing else:

```
RESTAURANT=snowdaes      npm run dev    ->  Snowdaes at /
RESTAURANT=asian-kitchen npm run dev    ->  Asian Kitchen at /
```

Unset defaults to Snowdaes. The value is read once in
`src/restaurants/active.ts`, validated loudly, and is constant per environment
because `PLATFORM.md` §2 settles that each restaurant gets its own deployment.

**This replaced a route per restaurant.** Both shops used to share one dev
server, Snowdaes at `/` and Asian Kitchen at `/asian-kitchen`. That forced Next
*route groups* — parenthesised folders like `app/(snowdaes)/` — to record who
owned `/` and `/api/*`, because a bare `app/api/` reads as "the app's API" when
it is one shop's Clover integration. Parentheses are Next arcana, and grouping
one restaurant while leaving the other ungrouped was worse than either choice
alone. Selecting the restaurant removes the ambiguity instead of labelling it,
and matches what production actually looks like.

## `api/clover/`

Named for the integration that owns it, so the question "whose API is this?"
has an answer in the path. Snowdaes is on Clover; a Square restaurant would get
`api/square/`.

These endpoints hold one merchant's credentials, so they refuse to answer on a
deployment that is not Snowdaes — `notThisDeployment()` in
`pos/clover/client.ts`, called first in every handler. On an Asian Kitchen build
they are not "not yet wired": they are somebody else's.

## The three files both restaurants touch

| File | Why it is shared |
|---|---|
| `layout.tsx` | Next permits exactly one root layout. Kept empty of personality: no fonts, no palette, no shop name |
| `globals.css` | Tailwind imports, `@theme inline` mappings (build configuration, not colour values), element resets. Each restaurant's palette is in its own `theme.css` |
| `favicon.ico` | Byte-identical to Next's stock icon, so it belongs to nobody. A real one goes with its restaurant |
