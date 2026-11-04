import { describe, expect, it } from 'vitest';
import { generate } from '../src/morph/generate.ts';
import { L, nounTable } from './helpers.ts';

const all = (m: Record<string, string>, f: Record<string, string>, n: Record<string, string>) => ({ ...m, ...f, ...n });

describe('adj12: magnus, magna, magnum', () => {
  it('all genders, all cases', () => {
    expect(generate(L('magnus, magna, magnum', 'adj'))).toEqual(all(
      nounTable(['magnus', 'magnī', 'magnō', 'magnum', 'magnō', 'magne'],
                ['magnī', 'magnōrum', 'magnīs', 'magnōs', 'magnīs', 'magnī'], '.m'),
      nounTable(['magna', 'magnae', 'magnae', 'magnam', 'magnā', 'magna'],
                ['magnae', 'magnārum', 'magnīs', 'magnās', 'magnīs', 'magnae'], '.f'),
      nounTable(['magnum', 'magnī', 'magnō', 'magnum', 'magnō', 'magnum'],
                ['magna', 'magnōrum', 'magnīs', 'magna', 'magnīs', 'magna'], '.n')));
  });
});

describe('adj12: līber, lībera, līberum (keeps e)', () => {
  it('all forms', () => {
    expect(generate(L('līber, lībera, līberum', 'adj'))).toEqual(all(
      nounTable(['līber', 'līberī', 'līberō', 'līberum', 'līberō', 'līber'],
                ['līberī', 'līberōrum', 'līberīs', 'līberōs', 'līberīs', 'līberī'], '.m'),
      nounTable(['lībera', 'līberae', 'līberae', 'līberam', 'līberā', 'lībera'],
                ['līberae', 'līberārum', 'līberīs', 'līberās', 'līberīs', 'līberae'], '.f'),
      nounTable(['līberum', 'līberī', 'līberō', 'līberum', 'līberō', 'līberum'],
                ['lībera', 'līberōrum', 'līberīs', 'lībera', 'līberīs', 'lībera'], '.n')));
  });
});

describe('adj12: pulcher, pulchra, pulchrum (drops e)', () => {
  it('all forms', () => {
    expect(generate(L('pulcher, pulchra, pulchrum', 'adj'))).toEqual(all(
      nounTable(['pulcher', 'pulchrī', 'pulchrō', 'pulchrum', 'pulchrō', 'pulcher'],
                ['pulchrī', 'pulchrōrum', 'pulchrīs', 'pulchrōs', 'pulchrīs', 'pulchrī'], '.m'),
      nounTable(['pulchra', 'pulchrae', 'pulchrae', 'pulchram', 'pulchrā', 'pulchra'],
                ['pulchrae', 'pulchrārum', 'pulchrīs', 'pulchrās', 'pulchrīs', 'pulchrae'], '.f'),
      nounTable(['pulchrum', 'pulchrī', 'pulchrō', 'pulchrum', 'pulchrō', 'pulchrum'],
                ['pulchra', 'pulchrōrum', 'pulchrīs', 'pulchra', 'pulchrīs', 'pulchra'], '.n')));
  });
});

describe('adj12 special cases', () => {
  it('meus: voc. masc. sg. mī', () => {
    expect(generate(L('meus, mea, meum', 'adj'))['voc.sg.m']).toBe('mī');
  });
  it('paucī, paucae, pauca: plural only', () => {
    const p = generate(L('paucī, paucae, pauca', 'adj'));
    expect(p['nom.sg.m']).toBeUndefined();
    expect(p['gen.pl.m']).toBe('paucōrum');
    expect(p['gen.pl.f']).toBe('paucārum');
    expect(p['acc.pl.n']).toBe('pauca');
    expect(Object.keys(p)).toHaveLength(18);
  });
});
