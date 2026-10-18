import {Component,type ReactNode} from 'react';
export function pdfModuleLoadFailure(error:unknown){let current=error;for(let depth=0;depth<4&&current;depth++){const text=typeof current==='object'&&'message' in current?String(current.message):String(current);if(/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk .*failed|chunkloaderror/i.test(text))return true;current=typeof current==='object'&&'cause' in current?current.cause:null;}return false;}
export async function reloadAfterPreserving(preserve:()=>Promise<boolean>,reload:()=>void){if(!await preserve())throw Error('当前阅读进度尚未保存，暂未重新加载。请先重试保存。');reload();}
/** A rejected React.lazy import stays rejected; recovery needs a guarded page reload. */
export class PdfReaderBoundary extends Component<{children:ReactNode;onReload:()=>Promise<void>},{error:unknown;busy:boolean;recoveryError:string}>{
 state={error:null as unknown,busy:false,recoveryError:''};
 static getDerivedStateFromError(error:unknown){return {error};}
 async recover(){this.setState({busy:true,recoveryError:''});try{await this.props.onReload();}catch(error){this.setState({recoveryError:error instanceof Error?error.message:'保存未完成，页面尚未重新加载。'});}finally{this.setState({busy:false});}}
 render(){if(!this.state.error)return this.props.children;const moduleFailure=pdfModuleLoadFailure(this.state.error);return <section className="pdf-module-error" role="alert"><h2>{moduleFailure?'PDF 阅读模块未能加载':'PDF 阅读区域出现错误'}</h2><p>{moduleFailure?'模块下载未完成。可以切换其他材料，或保存当前进度后重新加载页面。':'当前 PDF 暂时无法显示。可以切换其他材料，或保存当前进度后重新加载页面。'}</p><p>材料和已保存的阅读记录没有被删除。</p><button type="button" disabled={this.state.busy} onClick={()=>void this.recover()}>{this.state.busy?'正在保存…':'保存并重新加载页面'}</button>{this.state.recoveryError?<p>{this.state.recoveryError}</p>:null}</section>;}
}
