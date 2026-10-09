// The Edge shared bundle must vendored every module its own files import, or the
// function fails to load at `supabase start` rather than at build time. That
// happened: `packages/email/src/intl-locale.ts` was added and imported by three
// modules while the bundle listed its modules by hand, so the generated copy
// imported a file the bundler never wrote. These cases pin the closure walk that
// replaced the hand-written list.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractTypeDeclaration,
  moduleClosure,
  relativeImports,
  rewriteSpecifiers,
} from "./bundle-edge-shared.mjs";

test("a relative import is followed, value or type", () => {
  assert.deepEqual(
    relativeImports('import { a } from "./a.js";\nimport type { B } from "./b.js";'),
    ["a.ts", "b.ts"],
  );
});

test("a bare specifier is not mistaken for a relative one", () => {
  // `@wlbp/api-contracts` is rewritten to the generated contracts.ts, and a
  // package path climbing out of supabase/functions cannot be vendored at all.
  assert.deepEqual(
    relativeImports('import type { L } from "@wlbp/api-contracts";'),
    [],
  );
  assert.deepEqual(relativeImports('import { s } from "../../packages/x/s.js";'), []);
});

test("the closure reaches an indirectly imported helper", () => {
  // In packages/email, worker.ts imports payload.ts and samples.ts, and both of
  // those import intl-locale.ts. A flat list of what an Edge Function needs
  // directly would have missed it.
  const sources = {
    "worker.ts": 'import { a } from "./brand.js";',
    "brand.ts": 'import { l } from "./intl-locale.js";',
    "intl-locale.ts": "export const l = 1;\n",
  };
  const read = (target) => {
    const name = target.split("/").pop();
    assert.ok(sources[name], `unexpected read of ${target}`);
    return Promise.resolve(sources[name]);
  };
  return moduleClosure(
    { directory: "email", modules: ["worker.ts"], package: "packages/email" },
    read,
  ).then((closure) => {
    assert.deepEqual([...closure].sort(), ["brand.ts", "intl-locale.ts", "worker.ts"]);
  });
});

test("the closure terminates on a cycle", () => {
  const sources = {
    "a.ts": 'import "./b.js";',
    "b.ts": 'import "./a.js";',
  };
  const read = (target) => Promise.resolve(sources[target.split("/").pop()]);
  return moduleClosure(
    { directory: "x", modules: ["a.ts"], package: "packages/x" },
    read,
  ).then((closure) => assert.deepEqual([...closure].sort(), ["a.ts", "b.ts"]));
});

test("Node specifiers become the paths Deno opens", () => {
  assert.equal(
    rewriteSpecifiers(
      'import { a } from "./a.js";\nimport t from "@wlbp/api-contracts";',
    ),
    'import { a } from "./a.ts";\nimport t from "./contracts.ts";',
  );
});

test("a type declaration is taken verbatim, or the build fails", () => {
  const source = "export type A = 'a';\nexport type B = {\n  b: string;\n};\n";
  assert.equal(extractTypeDeclaration(source, "A"), "export type A = 'a';");
  assert.equal(
    extractTypeDeclaration(source, "B"),
    "export type B = {\n  b: string;\n};",
  );
  assert.equal(extractTypeDeclaration(source, "Missing"), null);
});
