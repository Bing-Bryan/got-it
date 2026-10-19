import {afterEach,describe,expect,it,vi} from 'vitest';
import {readingFontReady} from './useReadingLibrary';

const originalFonts=Object.getOwnPropertyDescriptor(document,'fonts');
afterEach(()=>{
  if(originalFonts)Object.defineProperty(document,'fonts',originalFonts);
  else Reflect.deleteProperty(document,'fonts');
  vi.useRealTimers();
});

describe('reading font readiness',()=>{
  it('resolves when document.fonts.ready resolves',async()=>{
    let resolve!:()=>void;
    Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(r=>{resolve=r;})}});
    let done=false;
    const pending=readingFontReady(10_000).then(()=>{done=true;});
    await Promise.resolve();
    expect(done).toBe(false);
    resolve();
    await pending;
    expect(done).toBe(true);
  });

  it('resolves on the bounded timeout when a font never settles',async()=>{
    vi.useFakeTimers();
    Object.defineProperty(document,'fonts',{configurable:true,value:{ready:new Promise<void>(()=>{})}});
    let done=false;
    const pending=readingFontReady(50).then(()=>{done=true;});
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(done).toBe(true);
  });

  it('treats a rejected fonts.ready as settled instead of blocking reading',async()=>{
    Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.reject(new Error('font failed'))}});
    await expect(readingFontReady(10_000)).resolves.toBeUndefined();
  });

  it('resolves immediately when the browser has no FontFaceSet',async()=>{
    Object.defineProperty(document,'fonts',{configurable:true,value:undefined});
    await expect(readingFontReady(10)).resolves.toBeUndefined();
  });
});
