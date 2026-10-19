import {resolve,dirname,join} from 'node:path';
import { absolutePath } from './private-storage';
import {createHostedApp} from './hosted-api';
import {HostedBudget, initializeBudget} from './hosted-budget';
import {createHostedRunner,hostedModelBaseUrl} from './hosted-model';
import {createBochaSearch} from './hosted-search';
import {createHostedVerificationRunner} from './hosted-verification';
import {HostedWebImports} from './hosted-web-imports';
import {hostedLocalWebProxyEnabled} from './hosted-local-web-proxy';
import {HostedResourceTickets} from './hosted-resource-tickets';
import {HostedTranslations,createHostedTranslationModel} from './hosted-translations';
import {HostedStatistics} from './hosted-statistics';
import {HostedAdmission} from './hosted-admission';
import {HostedAlerts} from './hosted-alerts';
import {hostedExternalAdapterPolicy} from './hosted-external-adapters';

// Files MUST live on a durable, private volume. No silent in-memory fallback.
const path=process.env.HOSTED_BUDGET_PATH;
if(!path||!absolutePath(path))throw new Error('HOSTED_BUDGET_PATH must be an absolute durable file path');
if(process.argv.includes('--init-budget')){
  initializeBudget(resolve(path));
  console.info('Hosted budget initialized; no model request was sent.');
}else{
  const origin=process.env.HOSTED_ORIGIN;
  if(!origin||new URL(origin).origin!==origin)throw new Error('HOSTED_ORIGIN must be an exact frontend origin');
  const allowLocalWebProxy=hostedLocalWebProxyEnabled();
  const statisticsPath=process.env.HOSTED_STATISTICS_PATH;
  if(!statisticsPath||!absolutePath(statisticsPath)||statisticsPath===path)throw new Error('HOSTED_STATISTICS_PATH must be a separate absolute durable path');
  const dailyLimit=Number(process.env.HOSTED_DAILY_BUDGET_USD||3);
  const budget=new HostedBudget(path,dailyLimit);
  const statistics=new HostedStatistics(statisticsPath);
  const alerts=new HostedAlerts(budget,{url:process.env.HOSTED_ALERT_WEBHOOK_URL,authorization:process.env.HOSTED_ALERT_WEBHOOK_AUTHORIZATION,format:process.env.HOSTED_ALERT_WEBHOOK_FORMAT,signingSecret:process.env.HOSTED_ALERT_WEBHOOK_SIGNING_SECRET,appId:process.env.HOSTED_ALERT_FEISHU_APP_ID,appSecret:process.env.HOSTED_ALERT_FEISHU_APP_SECRET,recipientOpenId:process.env.HOSTED_ALERT_FEISHU_RECIPIENT_OPEN_ID});
  alerts.start();
  const admission=new HostedAdmission({trustedProxy:process.env.HOSTED_TRUSTED_PROXY==='loopback'});
  const adapterPolicy=hostedExternalAdapterPolicy(process.env);
  const modelBaseUrl=hostedModelBaseUrl(process.env);
  const runner=process.env.DEEPSEEK_API_KEY?createHostedRunner(process.env.DEEPSEEK_API_KEY,modelBaseUrl):undefined;
  const searchCostUsd=Number(process.env.HOSTED_SEARCH_MAX_COST_USD);
  // A fixture endpoint only implements the model request contract. Never let a
  // fixture run use real translation or Bocha credentials, even if they exist in
  // an inherited shell environment.
  const searchConfigured=adapterPolicy.searchEnabled&&!!process.env.BOCHA_API_KEY&&Number.isFinite(searchCostUsd)&&searchCostUsd>0&&searchCostUsd<=3;
  const verificationRunner=runner&&searchConfigured?createHostedVerificationRunner(process.env.DEEPSEEK_API_KEY!,createBochaSearch(process.env.BOCHA_API_KEY!,process.env.BOCHA_API_ORIGIN)):undefined;
  const stateDir=join(dirname(path),'hosted-private-state');
  const webImports=new HostedWebImports(new HostedResourceTickets(stateDir),{allowLocalWebProxy});
  const translations=adapterPolicy.translationsEnabled&&process.env.DEEPSEEK_API_KEY?new HostedTranslations(budget,createHostedTranslationModel(process.env.DEEPSEEK_API_KEY)):undefined;
  const app=createHostedApp({origin,budget,statistics,admission,alerts,opsToken:process.env.HOSTED_OPS_TOKEN,trustedProxy:process.env.HOSTED_TRUSTED_PROXY==='loopback',runner,verificationRunner,searchCostUsd,webImports,translations,images:process.env.HOSTED_ENABLE_IMAGES==='1',apiId:process.env.HOSTED_API_ID,candidateId:process.env.HOSTED_CANDIDATE_ID,fixtureMode:process.env.NODE_ENV==='test'&&adapterPolicy.fixtureModel?'loopback-fixture':undefined});
  const port=Number(process.env.HOSTED_PORT||8788);
  const server=app.listen(port,'127.0.0.1',()=>console.info(`Hosted API listening on loopback port ${port}; model ${runner?'configured':'unavailable'}`));
  // Do not release the process lock while upstream calls may still be running.
  // Every exit path, including the forced timeout, releases the lock; reservations are
  // persisted before upstream calls, so an abandoned call can only over-count.
  process.on('exit',()=>{statistics.close();try{budget.close();}catch{/* best effort on exit */}});
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;statistics.close();server.close(()=>process.exit(0));server.closeIdleConnections();setTimeout(()=>process.exit(1),65_000).unref();};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
