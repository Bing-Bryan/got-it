/** Outline current section: last heading past the reading top; at a real scroll end, the last visible heading. */
export interface HeadingView {top:number;bottom:number;atEnd:boolean}
export function currentHeadingIndex(tops:readonly (number|null)[],view:HeadingView,offset=28):number|null{
 if(!tops.length)return null;
 // A hidden reader (start page, collapsed drawer) has no layout; keep the previous marker instead of guessing.
 if(view.bottom<=view.top)return null;
 let active=0;
 for(let i=0;i<tops.length;i++){const top=tops[i];if(top==null)continue;if(top<=view.top+offset)active=i;else break;}
 if(view.atEnd)for(let i=tops.length-1;i>active;i--){const top=tops[i];if(top!=null&&top<view.bottom-16){active=i;break;}}
 return active;
}
export function scrolledToEnd(scroll:Pick<HTMLElement,'scrollTop'|'scrollHeight'|'clientHeight'>):boolean{
 return scroll.scrollHeight>scroll.clientHeight+2&&scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-2;
}
