import type { SourceStatus } from "./library-types";
import type { WebTranslationState } from "./web-translation";

/** Whether the reading tool row must stay open: anything the reader may need to act on, or a failure they must see. */
export interface ReaderToolsState {
  blocked: boolean; busy: boolean; translationRunning: boolean;
  error: string; draftWarning: string; notice: string; recovery: boolean; unreadableRecovery: boolean;
  saveStatus: string; sourceStatus?: SourceStatus; translation?: Pick<WebTranslationState, "status" | "error">; translationNotice?: string;
}
// Settled save labels, including partial-import and read-only revision facts, are lasting conditions rather than alerts.
const ATTENTION_SAVE = /未保存|暂未保存|失败|待核对/;
const SETTLED_PARTIAL = /^(正文)?已保存/;
const ACTIONABLE_SOURCE: readonly SourceStatus[] = ["missing", "permission", "unreadable", "reselect", "changed"];

export function readerToolsNeedAttention(state: ReaderToolsState): boolean {
  if (state.blocked || state.busy || state.translationRunning || state.recovery || state.unreadableRecovery) return true;
  if (state.error || state.draftWarning || state.notice || state.translationNotice) return true;
  if (state.translation?.status === "failed" || (state.translation?.status === "interrupted" && state.translation.error)) return true;
  if (state.sourceStatus && ACTIONABLE_SOURCE.includes(state.sourceStatus)) return true;
  return ATTENTION_SAVE.test(state.saveStatus) && !SETTLED_PARTIAL.test(state.saveStatus);
}
