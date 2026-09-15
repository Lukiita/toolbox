import { describe, expect, it } from 'vitest';

import { compareFileCounts } from './compare.mts';
import { stringsFor } from './locale.mts';

const t = stringsFor('en');

const BASE = { 'src/app/app/actions.ts': 208, 'src/lib/server/booking.ts': 106 };

describe('compareFileCounts', () => {
  it('passes when the file is tied', () => {
    expect(compareFileCounts(BASE, BASE, t)).toEqual([]);
  });

  it('passes when the file improves', () => {
    const failures = compareFileCounts(BASE, { ...BASE, 'src/app/app/actions.ts': 200 }, t);
    expect(failures).toEqual([]);
  });

  it('fails a local regression even when the repo total drops', () => {
    // The case measured at e6d4144: actions.ts 208 → 213 while the repo went
    // from 799 to 792. It is the reason the metric is per file.
    const failures = compareFileCounts(
      BASE,
      { 'src/app/app/actions.ts': 213, 'src/lib/server/booking.ts': 90 },
      t,
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ limit: 208, current: 213 });
    expect(failures[0].message).toContain('src/app/app/actions.ts');
  });

  it('treats a new file as baseline zero', () => {
    const failures = compareFileCounts(BASE, { 'src/lib/new.ts': 3 }, t);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ limit: 0, current: 3 });
  });

  it('ignores a file that vanished from the report', () => {
    expect(compareFileCounts(BASE, {}, t)).toEqual([]);
  });

  it('sorts by biggest regression, which is the fixing order', () => {
    const failures = compareFileCounts(
      BASE,
      { 'src/app/app/actions.ts': 210, 'src/lib/new.ts': 30 },
      t,
    );
    expect(failures.map((f) => f.current - f.limit)).toEqual([30, 2]);
  });
});
