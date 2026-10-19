import {useMemo} from 'react';
import {ExternalLink,Info} from 'lucide-react';
import type {ThreadMessage} from './types';
import {renderMarkdown} from './lib/markdown';
import {safeSourceUrl} from './lib/evidence';
import {VerificationAnswer} from './VerificationAnswer';
import {CompactSources} from './CompactSources';

export function AssistantMessage({ message, verification = false, entity = false, failure, history = false }: { message: ThreadMessage; verification?: boolean; entity?: boolean; failure?: string; history?: boolean }) {
  const isReview = message.operation ? message.operation === "verify" : verification;
  const isWebExplanation = !isReview && (message.explanationMode === "web" || (message.explanationMode === "auto" && (message.search?.status !== "not-executed" && message.search !== undefined || !!message.sources?.length)));
  const isIntroduction = message.operation ? message.operation === "entity" : entity;
  const websites = (message.sources ?? []).filter(source => safeSourceUrl(source.url)).filter((source, index, all) => all.findIndex(other => other.url === source.url) === index).sort((a, b) => Number(b.websiteRole === "official") - Number(a.websiteRole === "official"));
  const renderedAnswer = useMemo(() => renderMarkdown(message.content), [message.content]);
  return (
    <article className="assistant-message" data-message-id={message.id} data-completion={message.completion}>
      {isReview ? <VerificationAnswer message={message} failure={failure} history={history} /> : <>
      {message.mode === "demo" ? (
        <div className="demo-answer-label"><Info size={12} /> 演示回答 · 未调用真实模型</div>
      ) : null}
      {message.completion === "provisional" && !message.verification ? <p className="provisional-note" role="status">正在生成，内容尚未完成{message.operation === "verify" || message.operation === "entity" || isWebExplanation ? "；来源与结论尚未核对" : ""}。</p> : null}
      {message.completion === "interrupted" && !failure ? <p className="no-source-note">本轮中断，未收到最终结果。</p> : null}
      {message.contextNotice ? <p className="document-context-note">{message.contextNotice}</p> : null}
      <div className="answer-markdown" dangerouslySetInnerHTML={{ __html: renderedAnswer.html }} />
      {isWebExplanation ? <CompactSources message={message} answerHtml={renderedAnswer.html} /> : null}
      {isIntroduction && websites.length > 0 ? <nav className="website-links" aria-label="相关网站"><small>相关网站</small>{websites.map(source => <a key={source.id} href={safeSourceUrl(source.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} aria-hidden="true" /><span>{source.title}<small>{new URL(source.url).hostname}</small></span>{source.websiteRole === "official" ? <em>官网</em> : null}</a>)}</nav> : null}
      </>}
    </article>
  );
}
