import {describe,expect,it} from 'vitest';
import {hostedExternalAdapterPolicy} from './hosted-external-adapters';

describe('hosted fixture adapter isolation',()=>{
  it('keeps default production adapters unchanged when no fixture endpoint is configured',()=>{
    expect(hostedExternalAdapterPolicy({} as NodeJS.ProcessEnv)).toEqual({
      fixtureModel:false,
      searchEnabled:true,
      translationsEnabled:true,
    });
  });

  it('disables all external adapters not served by the local model fixture',()=>{
    expect(hostedExternalAdapterPolicy({
      NODE_ENV:'test',
      HOSTED_MODEL_BASE_URL:'http://127.0.0.1:4999',
      DEEPSEEK_API_KEY:'fake-fixture-key',
      BOCHA_API_KEY:'must-not-be-used',
      BOCHA_API_ORIGIN:'http://127.0.0.1:4998',
    } as NodeJS.ProcessEnv)).toEqual({
      fixtureModel:true,
      searchEnabled:false,
      translationsEnabled:false,
    });
  });
});
