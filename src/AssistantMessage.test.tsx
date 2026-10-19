import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {AssistantMessage} from './AssistantMessage';
import {homeReadingExamples} from './home-reading-examples';

it('does not present a failed search as successful even when a controlled payload claims support',()=>{
 const saved=homeReadingExamples.find(example=>example.id==='verify')!.message;
 const html=renderToStaticMarkup(<AssistantMessage message={{...saved,search:{status:'failed',completedSearches:0,failedSearches:1},verification:{...saved.verification!,verdict:'supported',summary:'CONTROLLED_SUCCESS_CLAIM'}}}/>);
 const view=document.createElement('div');view.innerHTML=html;
 expect(view.querySelector('.verification-conclusion')?.textContent).toContain('失败');
 expect(view.textContent).not.toContain('CONTROLLED_SUCCESS_CLAIM');
 expect(view.querySelectorAll('.excerpt-label.verified')).toHaveLength(saved.sources!.filter(source=>source.retrievalStatus==='matched'&&source.excerptKind==='quote'&&!!source.excerpt).length);
 expect(view.querySelectorAll('.source-reading-card')).toHaveLength(saved.sources!.length);
});
it('keeps interrupted answers visibly incomplete and sanitizes the rendered content',()=>{
 const saved=homeReadingExamples.find(example=>example.id==='explain')!.message;
 const html=renderToStaticMarkup(<AssistantMessage message={{...saved,completion:'interrupted',content:'Retained partial answer<script>window.bad=true</script>'}}/>);
 const view=document.createElement('div');view.innerHTML=html;
 expect(view.querySelector('.no-source-note')).not.toBeNull();expect(view.textContent).toContain('Retained partial answer');expect(view.querySelector('script')).toBeNull();
});
