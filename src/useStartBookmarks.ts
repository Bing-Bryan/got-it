import {useCallback,useEffect,useState} from 'react';
import {libraryRequest} from './lib/library-client';
import type {BookmarkPage} from './lib/bookmark-types';
/** A bounded, read-only preview; the existing full view retains pagination and management. */
export function useStartBookmarks(ready:boolean,version:number,entryId?:string){
 const [page,setPage]=useState<BookmarkPage|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!ready)return;let current=true;setLoading(true);setError('');void libraryRequest<BookmarkPage>('/bookmarks?q=&offset=0&limit=50').then(value=>{if(!value||!Array.isArray(value.bookmarks))throw Error('收藏数据暂时无法读取。');if(current)setPage(value);}).catch(e=>{if(current)setError(e instanceof Error?e.message:'收藏暂时无法读取。');}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[ready,version,entryId,retry]);
 return {page,loading,error,reload:useCallback(()=>setRetry(n=>n+1),[])};
}
