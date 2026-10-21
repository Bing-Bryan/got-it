/** Describes existing request guards; it never grants permission or sends requests. */
export interface ActionAvailabilityState {
  readOnly?: boolean;
  ready?: boolean;
  busy?: boolean;
  saveFailed?:boolean;
  invalidSelection?: boolean;
  generating?: boolean;
  modelReady?: boolean;
  hosted?: boolean;
}
export interface ActionUnavailable {
  reason: 'read-only' | 'save-failed' | 'initializing' | 'saving' | 'invalid-selection' | 'generating' | 'model';
  message: string;
  recovery?: 'connection' | 'save';
  recoveryLabel?:string;
}
export function actionUnavailable(s: ActionAvailabilityState): ActionUnavailable | undefined {
  if (s.readOnly) return {reason:'read-only',message:'当前材料为只读，不能新增问题；已有内容仍可阅读。'};
  if (s.ready === false) return {reason:'initializing',message:'阅读记录尚未准备好，请先查看保存状态。',recovery:'save'};
  if (s.saveFailed) return {reason:"save-failed",message:"阅读记录保存失败，请先恢复保存；当前内容仍保留。",recovery:"save"};
  if (s.busy) return {reason:'saving',message:'正在处理阅读记录，请稍候；可查看保存状态。',recovery:'save'};
  if (s.invalidSelection) return {reason:'invalid-selection',message:'当前选区不能用于提问，请重新选择有效原文。'};
  if (s.generating) return {reason:'generating',message:'同一范围已有请求正在生成，请等待完成或在原回答处停止。'};
  if (s.modelReady === false) return {reason:'model',message:s.hosted?'体验服务当前不可用，请查看服务状态。':'模型尚未就绪，请检查连接与模型设置。',recovery:'connection',recoveryLabel:s.hosted?'查看服务状态':'查看连接与模型'};
}
