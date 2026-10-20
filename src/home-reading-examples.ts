import type { ThreadMessage, ProviderId } from "./types";

export interface HomeReadingExample {
  id: "explain" | "verify" | "ask";
  label: string;
  articleTitle: string;
  articlePath: string;
  before: string;
  quote: string;
  /** Shorter pull-quote for the start tile; `quote` stays verbatim for the demo's source pane. */
  cardQuote?: string;
  after: string;
  question?: string;
  title: string;
  /** A complete sentence copied verbatim from message.content. */
  preview: string;
  message: ThreadMessage;
  provenance: {
    generatedAt: string;
    providerId: ProviderId;
    model?: string;
    sourcePath: string;
    sourceLine: number;
    sourceSha256: string;
    sourceUrl: string;
    attempt: number;
  };
}

// Real, finite public-excerpt sampling on 2026-10-19. Opening this static data
// makes no network/model request. Full provenance is kept with this iteration.
export const homeReadingExamples: HomeReadingExample[] = [
  {
    "id": "explain",
    "label": "解释一下",
    "before": "更宽口径的“AI陪伴整体市场”一家机构估计2025年约368亿美元、2035年约5525亿美元（",
    "quote": "CAGR≈31%",
    "after": "）",
    "question": "这里的 CAGR≈31% 是什么意思？请用两到三个简短句子解释，并说明它是预测口径，不代表每年都会按此比例增长。",
    "title": "CAGR≈31% 是什么意思？",
    "articleTitle": "陪伴类AI产品（软/硬件）深度分析报告",
    "articlePath": "/hosted-samples/companion-ai-report.md",
    "preview": "CAGR 是“复合年均增长率”，意思是在给定起止年份里，按复利方式折算出的平均每年增长速度。",
    "message": {
      "sources": [],
      "evidenceStatus": "not-applicable",
      "search": {
        "status": "not-executed",
        "completedSearches": 0,
        "failedSearches": 0
      },
      "mode": "live",
      "providerId": "deepseek",
      "providerName": "体验版默认模型",
      "model": "deepseek-flash",
      "id": "home-reading-explain-20261019",
      "role": "assistant",
      "content": "CAGR 是“复合年均增长率”，意思是在给定起止年份里，按复利方式折算出的平均每年增长速度。结合上下文，它把2025年约368亿美元和2035年约5525亿美元之间的增长，概括成一个平均每年约31%的增速水平。它是预测和估算口径，只说明十年间的整体平均趋势，并不代表现实中每一年都会恰好按31%增长。",
      "createdAt": "2026-10-19T07:49:48.430Z",
      "completion": "complete",
      "operation": "explain",
      "explanationMode": "local"
    },
    "provenance": {
      "generatedAt": "2026-10-19T07:49:48.430Z",
      "providerId": "deepseek",
      "model": "deepseek-flash",
      "sourcePath": "public/hosted-samples/companion-ai-report.md",
      "sourceLine": 13,
      "sourceSha256": "6179c59b803cd5137e1454e809336c733e83d2ce6efc52eff6747c6a6a6e07e9",
      "sourceUrl": "https://techbullion.com/ai-companion-market-size-share-report-2035/",
      "attempt": 1
    }
  },
  {
    "id": "verify",
    "label": "查找来源",
    "before": "De Freitas 等人的实验发现，",
    "quote": "与AI陪伴对话缓解孤独的短期效果与真人互动相当",
    "after": "，优于看视频等其他活动；",
    "question": "请核对这句仅指短期实验的结论。优先论文 AI Companions Reduce Loneliness：https://arxiv.org/abs/2407.19096 。用简短中文总结；若有已读正文，引文请逐字且不超过25个英文词。不要强行判为支持。",
    "title": "短期效果与真人互动相当，有依据吗？",
    "articleTitle": "陪伴类AI产品（软/硬件）深度分析报告",
    "articlePath": "/hosted-samples/companion-ai-report.md",
    "preview": "已保留参考资料，但不足以确认原句的完整结论。",
    "message": {
      "verification": {
        "verdict": "partial",
        "summary": "已保留参考资料，但不足以确认原句的完整结论。",
        "reason": "资料「[2407.19096v1] AI Companions Reduce Loneliness」记录的范围为：2024年工作论文；摘要层面的实验结论，具体样本、地区与测量周期未在节选中给出。",
        "readingAdvice": "上述限制不代表原文错误，也不能把原句作为已确认事实引用。",
        "claims": [
          {
            "text": "AI陪伴对话在实验中缓解孤独的效果与和真人互动相当。",
            "verdict": "partial",
            "sourceIds": [
              "source-1"
            ]
          },
          {
            "text": "该效果优于看YouTube等其他活动。",
            "verdict": "partial",
            "sourceIds": [
              "source-1"
            ]
          },
          {
            "text": "该结论仅指短期孤独感变化，不外推长期效果。",
            "verdict": "insufficient",
            "sourceIds": [
              "source-1"
            ]
          },
          {
            "text": "论文采用微调大语言模型检测对话与评论中的孤独感。",
            "verdict": "partial",
            "sourceIds": [
              "source-1"
            ]
          }
        ],
        "round": 1,
        "scope": "initial",
        "completion": "complete"
      },
      "sources": [
        {
          "id": "source-1",
          "title": "[2407.19096v1] AI Companions Reduce Loneliness",
          "url": "https://arxiv.org/abs/2407.19096v1",
          "domain": "arxiv.org",
          "publishedAt": "2024-07-09T13:06:00+08:00",
          "excerpt": "Study 3 finds that AI companions successfully alleviate loneliness on par only with interacting with another person",
          "snippet": "Study 3 finds that AI companions successfully alleviate loneliness on par only with interacting with another person",
          "excerptKind": "quote",
          "retrievalStatus": "matched",
          "relation": "supports",
          "applicability": "partial",
          "scope": "2024年工作论文；摘要层面的实验结论，具体样本、地区与测量周期未在节选中给出",
          "origin": "original",
          "reliability": "moderate",
          "reliabilityReasons": [
            "为arXiv论文摘要页，属作者方原始发布渠道",
            "节选直接陈述Study 3的比较结论，非二手转述",
            "仅为摘要，缺方法、样本量与测量时点细节",
            "未提供同行评审状态信息"
          ],
          "locatable": true,
          "checkedAt": "2026-10-19T08:33:37.636Z",
          "differences": []
        }
      ],
      "search": {
        "status": "executed",
        "completedSearches": 1,
        "failedSearches": 0
      },
      "evidenceStatus": "partial",
      "mode": "live",
      "providerId": "deepseek",
      "providerName": "体验版默认模型",
      "model": "deepseek-flash",
      "id": "home-reading-verify-evidence-20261019",
      "role": "assistant",
      "content": "已保留参考资料，但不足以确认原句的完整结论。\n\n资料「[2407.19096v1] AI Companions Reduce Loneliness」记录的范围为：2024年工作论文；摘要层面的实验结论，具体样本、地区与测量周期未在节选中给出。\n\n上述限制不代表原文错误，也不能把原句作为已确认事实引用。",
      "createdAt": "2026-10-19T08:33:28.826Z",
      "completion": "complete",
      "operation": "verify",
      "scope": "initial",
      "round": 1
    },
    "provenance": {
      "generatedAt": "2026-10-19T08:33:28.826Z",
      "providerId": "deepseek",
      "model": "deepseek-flash",
      "sourcePath": "public/hosted-samples/companion-ai-report.md",
      "sourceLine": 61,
      "sourceSha256": "6179c59b803cd5137e1454e809336c733e83d2ce6efc52eff6747c6a6a6e07e9",
      "sourceUrl": "https://arxiv.org/abs/2407.19096v1",
      "attempt": 2
    }
  },
  {
    "id": "ask",
    "label": "问一问",
    "before": "与AI陪伴对话缓解孤独的短期效果与真人互动相当，优于看视频等其他活动；“感到被倾听”是关键中介变量，作用大于聊天机器人本身的能力。",
    "quote": "研究也指出效果是即时的，未证明能长期降低孤独感。",
    "cardQuote": "研究指出效果及时性，未证明能长期降低孤独感。",
    "after": "",
    "question": "为什么短期有效，不能说明长期也有效？请用两到三个简短句子结合原句解释。",
    "title": "短期有效，为什么不代表长期有效？",
    "articleTitle": "陪伴类AI产品（软/硬件）深度分析报告",
    "articlePath": "/hosted-samples/companion-ai-report.md",
    "preview": "原句只说效果是“即时”的，即在与AI陪伴对话当下或短期能缓解孤独，但研究并未去证明这种效果能维持到长期。",
    "message": {
      "sources": [],
      "evidenceStatus": "not-applicable",
      "search": {
        "status": "not-executed",
        "completedSearches": 0,
        "failedSearches": 0
      },
      "mode": "live",
      "providerId": "deepseek",
      "providerName": "体验版默认模型",
      "model": "deepseek-flash",
      "id": "home-reading-ask-20261019",
      "role": "assistant",
      "content": "原句只说效果是“即时”的，即在与AI陪伴对话当下或短期能缓解孤独，但研究并未去证明这种效果能维持到长期。所以短期有效只反映即时作用，不能推出长期降低孤独感也成立，长期效果目前仍是未被证明的缺口。",
      "createdAt": "2026-10-19T07:50:01.999Z",
      "completion": "complete",
      "operation": "ask"
    },
    "provenance": {
      "generatedAt": "2026-10-19T07:50:01.999Z",
      "providerId": "deepseek",
      "model": "deepseek-flash",
      "sourcePath": "public/hosted-samples/companion-ai-report.md",
      "sourceLine": 61,
      "sourceSha256": "6179c59b803cd5137e1454e809336c733e83d2ce6efc52eff6747c6a6a6e07e9",
      "sourceUrl": "https://www.arxiv.org/pdf/2407.19096",
      "attempt": 1
    }
  }
];
