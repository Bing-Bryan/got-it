// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {ADMISSION_LIMITS, HostedAdmission} from './hosted-admission';

const owner = (n: number) => `12345678-1234-4123-8123-${String(n).padStart(12, '0')}`;

describe('categorized hosted admission', () => {
  it('reserves a sixth slot for inquiry and never lends it to non-inquiry work', () => {
    const admission = new HostedAdmission({initialTokens: 'capacity'});
    const translations = [1, 2, 3].map(n => admission.acquire('translation', owner(n)));
    const captures = [4, 5].map(n => admission.acquire('capture', owner(n)));
    expect(admission.snapshot().slots).toMatchObject({global: 5, nonInquiry: 5, translation: 3, capture: 2, inquiry: 0});
    expect(() => admission.acquire('translation', owner(6))).toThrow(/请求较多/);
    expect(() => admission.acquire('capture', owner(7))).toThrow(/请求较多/);
    const inquiry = admission.acquire('inquiry', owner(8));
    expect(admission.snapshot().slots).toMatchObject({global: 6, nonInquiry: 5, inquiry: 1});
    expect(() => admission.acquire('inquiry', owner(9))).toThrow(/请求较多/);
    expect(admission.snapshot().counts.busyByCategory).toMatchObject({translation: 1, capture: 1, inquiry: 1});
    for (const lease of [...translations, ...captures, inquiry]) lease.releaseNow();
    expect(admission.snapshot().slots).toMatchObject({global: 0, nonInquiry: 0, translation: 0, capture: 0, inquiry: 0});
  });

  it('admits five translation IDs and one inquiry at the same time', () => {
    const admission = new HostedAdmission({initialTokens: 'capacity'});
    const translations = [1, 2, 3, 4, 5].map(n => admission.acquire('translation', owner(n)));
    expect(admission.snapshot().slots).toMatchObject({global: 5, translation: 5, nonInquiry: 5, inquiry: 0});
    const inquiry = admission.acquire('inquiry', owner(6));
    expect(admission.snapshot().slots).toMatchObject({global: 6, translation: 5, inquiry: 1});
    expect(ADMISSION_LIMITS.translationSlots).toBe(5);
    for (const lease of [...translations, inquiry]) lease.releaseNow();
    expect(admission.snapshot().slots.global).toBe(0);
  });

  it('lets up to six inquiries share idle slots while preserving the per-ID limit', () => {
    const admission = new HostedAdmission({initialTokens: 'capacity'});
    const inquiries = [1, 2, 3, 4, 5, 6].map(n => admission.acquire('inquiry', owner(n)));
    expect(admission.snapshot().slots).toMatchObject({global: 6, nonInquiry: 0, inquiry: 6});
    expect(() => admission.acquire('inquiry', owner(7))).toThrow(/请求较多/);
    expect(() => admission.acquire('translation', owner(7))).toThrow(/请求较多/);
    for (const lease of inquiries) lease.releaseNow();
    const sameIdFirst = admission.acquire('inquiry', owner(1));
    expect(() => admission.acquire('inquiry', owner(1))).toThrow(/请求较多/);
    expect(admission.snapshot().counts.busyByCategory.inquiry).toBe(2);
    sameIdFirst.releaseNow();
    expect(admission.snapshot().slots.global).toBe(0);
  });

  it('reports limits in the public snapshot and keeps inquiry occupancy non-negative', () => {
    const admission = new HostedAdmission({initialTokens: 'capacity'});
    expect(admission.snapshot().slots.limits).toEqual({global: 6, nonInquiry: 5, perId: 1, translation: 5, capture: 2});
    const translations = [1, 2, 3, 4, 5].map(n => admission.acquire('translation', owner(n)));
    expect(admission.snapshot().slots.inquiry).toBe(0);
    const inquiry = admission.acquire('inquiry', owner(6));
    expect(admission.snapshot().slots.inquiry).toBe(1);
    inquiry.releaseNow();
    expect(admission.snapshot().slots).toMatchObject({global: 5, inquiry: 0});
    for (const lease of translations) lease.releaseNow();
    expect(admission.snapshot().slots).toMatchObject({global: 0, inquiry: 0, nonInquiry: 0});
  });

  it('does not release a slot until tracked lower-level work settles', async () => {
    const admission = new HostedAdmission({initialTokens: 'capacity'});
    const lease = admission.acquire('translation', owner(1));
    let finish!: () => void;
    const work = new Promise<void>(resolve => { finish = resolve; });
    lease.track(work);
    let released = false;
    const settling = lease.settle().then(() => { released = true; });
    await Promise.resolve();
    expect(released).toBe(false);
    expect(admission.snapshot().slots.global).toBe(1);
    finish();
    await settling;
    expect(released).toBe(true);
    expect(admission.snapshot().slots).toMatchObject({global: 0, nonInquiry: 0, translation: 0});
  });
});
