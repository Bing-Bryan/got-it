import {HOSTED} from './lib/runtime-mode';

/** Persistent consent is separate from an explicit, one-off translation action. */
export function TranslationPrivacySettings({automatic,onAutomaticChange,compact=false}:{automatic:boolean;onAutomaticChange:(value:boolean)=>void;compact?:boolean}) {
  return <section className="translation-privacy-settings" aria-label="全文翻译与自动偏好">
    {!compact?<><strong>全文翻译</strong>
    <p>点击翻译会将全部可翻译正文分批发送给当前 AI；代码、URL 和图片不发送，原文保留。PDF 只发送文字层段落，在原页对应位置显示中文，扫描页与图像不发送。</p>
    <p>{HOSTED?'每批通过托管服务发送给模型服务商并使用体验额度；服务端不持久保存正文或译文，成果保存在当前浏览器。':'正文通过本机连接发送给所选模型服务商，材料和成果保存在本机；不包含图片，也不改动原文件。'}停止后已完成部分保留。</p></>:null}
    <label><input type="checkbox" checked={automatic} onChange={event=>onAutomaticChange(event.target.checked)}/>以后自动翻译确认加入的新英文网页</label>
    {!compact?<p className="translation-preference-note">默认关闭；仅影响之后确认加入的新英文网页。打开已有材料、重复网址、Markdown 和 PDF 不会自动翻译，可随时关闭。</p>:null}
  </section>;
}
