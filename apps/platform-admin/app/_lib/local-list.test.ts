import { expect, it } from "vitest";
import { localList } from "./local-list";
import { parseListParams } from "./list-params";
it("filters the full operator catalog before slicing the requested page", () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({
    name: `Synthetic operator ${index}`,
    enabled: index % 2 === 0,
  }));
  const list = parseListParams({ q: "synthetic", page: "2" }, { pageSize: 25 });
  const page = localList(
    rows,
    list,
    (row) => row.name,
    (row) => row.enabled,
  );
  expect(page.total).toBe(30);
  expect(page.rows).toHaveLength(5);
  expect(page.rows[0]?.name).toBe("Synthetic operator 50");
});
