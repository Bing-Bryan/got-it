import { describe,it,expect } from 'vitest';
import {actionUnavailable} from './action-availability';
describe('existing request guard explanations',()=>{
 it.each([
  [{readOnly:true,ready:false,busy:true,invalidSelection:true,generating:true,modelReady:false},'read-only'],
  [{ready:false,busy:true,invalidSelection:true,generating:true,modelReady:false},'initializing'],
  [{saveFailed:true,busy:true,modelReady:false},'save-failed'],
  [{busy:true,invalidSelection:true,generating:true,modelReady:false},'saving'],
  [{invalidSelection:true,generating:true,modelReady:false},'invalid-selection'],
  [{generating:true,modelReady:false},'generating'],
  [{modelReady:false},'model'],
 ] as const)('prioritizes %j',(state,reason)=>expect(actionUnavailable(state)?.reason).toBe(reason));
 it('does not create a guard for ready state',()=>expect(actionUnavailable({ready:true,modelReady:true})).toBeUndefined());
 it('routes hosted model failure to service language, not local model setup',()=>{expect(actionUnavailable({modelReady:false,hosted:true})?.message).toContain('体验服务');expect(actionUnavailable({modelReady:false})?.message).toContain('模型');});
});
