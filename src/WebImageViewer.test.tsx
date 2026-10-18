import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { WebImageViewer, constrainImageView } from "./WebImageViewer";
let root:Root,article:ReturnType<typeof createRef<HTMLElement>>,image:HTMLImageElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});article=createRef();article.current=document.body.appendChild(document.createElement('article'));image=document.createElement('img');image.dataset.webMedia='id';image.src='blob:local';image.alt='图表';image.tabIndex=0;Object.defineProperties(image,{naturalWidth:{value:634,configurable:true},naturalHeight:{value:460}});article.current.append(image);root=createRoot(document.body.appendChild(document.createElement('div')));});
afterEach(async()=>{await act(async()=>root.unmount());document.body.innerHTML='';});
it('opens only a local image using keyboard and returns focus without changing reader scroll',async()=>{await act(async()=>root.render(<WebImageViewer article={article} documentKey="doc"/>));article.current!.scrollTop=211;image.focus();await act(async()=>image.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(document.querySelector('dialog')?.getAttribute('open')).not.toBeNull();expect(document.querySelector('.web-image-viewport img')?.getAttribute('width')).toBe('634');await act(async()=>document.querySelector<HTMLButtonElement>('dialog button')!.click());expect(document.querySelector('dialog')).toBeNull();expect(document.activeElement).toBe(image);expect(article.current!.scrollTop).toBe(211);});
it('refuses remote image URLs and closes on Escape cancel',async()=>{await act(async()=>root.render(<WebImageViewer article={article} documentKey="doc"/>));image.src='https://remote.test/image';await act(async()=>image.click());expect(document.querySelector('dialog')).toBeNull();image.src='blob:local';await act(async()=>image.click());const dialog=document.querySelector('dialog')!;await act(async()=>dialog.dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true})));expect(document.querySelector('dialog')).toBeNull();});

it('contains tall images and bounds extreme zoom/pan without losing the image',()=>{
 expect(constrainImageView({scale:0,x:90,y:80},{width:600,height:3000},{width:1000,height:600})).toEqual({scale:.2,x:0,y:0});
 expect(constrainImageView({scale:100,x:10000,y:-10000},{width:600,height:3000},{width:1000,height:600})).toEqual({scale:4,x:700,y:-5700});
});
it('zooms with wheel and ctrl-wheel, closes on blank, and reopens fitted without visible tools',async()=>{
 await act(async()=>root.render(<WebImageViewer article={article} documentKey="doc"/>));await act(async()=>image.click());
 const surface=document.querySelector<HTMLElement>('.web-image-viewport')!;
 const fittedTransform=surface.querySelector('img')!.style.transform;
 for(const ctrlKey of [false,true]){await act(async()=>surface.dispatchEvent(new WheelEvent('wheel',{deltaY:-60,ctrlKey,bubbles:true,cancelable:true})));}
 const initialTransform=surface.querySelector('img')!.style.transform;
 expect(initialTransform).not.toBe(fittedTransform);
 expect(document.querySelector('dialog header, dialog p, dialog output')).toBeNull();
 expect(document.querySelectorAll('dialog button')).toHaveLength(1);
 expect(document.querySelector('dialog button')?.className).toBe('web-image-screen-reader-close');
 await act(async()=>document.querySelector<HTMLImageElement>('.web-image-viewport img')!.click());expect(document.querySelector('dialog')).not.toBeNull();
 await act(async()=>{surface.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0}));surface.click();});expect(document.querySelector('dialog')).toBeNull();
 await act(async()=>image.click());expect(document.querySelector<HTMLElement>('.web-image-viewport img')!.style.transform).toBe(fittedTransform);
});
it('cleans preview on document switch without restoring old image focus',async()=>{
 await act(async()=>root.render(<WebImageViewer article={article} documentKey="A"/>));await act(async()=>image.click());
 const focus=vi.spyOn(image,'focus');await act(async()=>root.render(<WebImageViewer article={article} documentKey="B"/>));expect(document.querySelector('dialog')).toBeNull();expect(focus).not.toHaveBeenCalled();
});
it('does not close a zoomed image when capture retargets a click or after a drag',async()=>{
 await act(async()=>root.render(<WebImageViewer article={article} documentKey="A"/>));await act(async()=>image.click());const surface=document.querySelector<HTMLElement>('.web-image-viewport')!,pic=surface.querySelector('img')!;
 await act(async()=>surface.dispatchEvent(new WheelEvent('wheel',{deltaY:-80,bubbles:true,cancelable:true})));
 const pointer=(node:HTMLElement,type:string,x:number,y:number)=>node.dispatchEvent(new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
 await act(async()=>{pointer(pic,'pointerdown',10,10);pointer(surface,'pointerup',10,10);surface.click();});expect(document.querySelector('dialog')).not.toBeNull();
 await act(async()=>{pointer(surface,'pointerdown',10,10);pointer(surface,'pointermove',10,100);pointer(surface,'pointerup',10,100);surface.click();});expect(document.querySelector('dialog')).not.toBeNull();
});
it('ignores unloaded local images',async()=>{
 Object.defineProperty(image,'naturalWidth',{value:0,configurable:true});await act(async()=>root.render(<WebImageViewer article={article} documentKey="A"/>));await act(async()=>image.click());expect(document.querySelector('dialog')).toBeNull();
});
