/**
 * Golden Test Sets for Multilingual Evaluation
 *
 * 60 test cases across 6 languages (en, zh, ko, ja, hi, ar) with 10 cases
 * per language. Each case targets a realistic query pattern: factual recall,
 * preference lookup, name search, temporal queries, and cross-lingual
 * retrieval scenarios.
 *
 * These golden sets are used by the multilingual evaluation harness to detect
 * search quality regressions across language packs and embedding changes.
 *
 * @module lib/eval/golden-sets
 */

import type { EvalCase } from '../multilingual-eval';

// =============================================================================
// Types
// =============================================================================

/**
 * A golden test case with expected content and minimum acceptable score.
 */
export interface GoldenTestCase {
  /** Unique identifier for this test case */
  id: string;
  /** BCP-47 language code */
  language: string;
  /** The search query in the target language */
  query: string;
  /** IDs that should appear in results */
  expectedIds: string[];
  /** Content snippets that should match */
  expectedContent: string[];
  /** Minimum acceptable relevance score (0-1) */
  minScore: number;
}

// =============================================================================
// English (en) - 10 cases
// =============================================================================

const EN_CASES: GoldenTestCase[] = [
  {
    id: 'en-factual-001',
    language: 'en',
    query: 'What programming language does the user prefer?',
    expectedIds: ['en-mem-001'],
    expectedContent: ['The user prefers TypeScript for all new projects.'],
    minScore: 0.7,
  },
  {
    id: 'en-preference-002',
    language: 'en',
    query: 'favorite coffee order',
    expectedIds: ['en-mem-002'],
    expectedContent: ['The user orders a large oat milk latte every morning.'],
    minScore: 0.65,
  },
  {
    id: 'en-name-003',
    language: 'en',
    query: 'Who is the project manager on the Atlas team?',
    expectedIds: ['en-mem-003'],
    expectedContent: ['Sarah Kim is the project manager for the Atlas initiative.'],
    minScore: 0.7,
  },
  {
    id: 'en-temporal-004',
    language: 'en',
    query: 'upcoming vacation plans',
    expectedIds: ['en-mem-004'],
    expectedContent: ['The user is planning a trip to Portugal in March.'],
    minScore: 0.6,
  },
  {
    id: 'en-technical-005',
    language: 'en',
    query: 'database migration strategy',
    expectedIds: ['en-mem-005'],
    expectedContent: ['The team decided to migrate from MySQL to PostgreSQL using pgloader.'],
    minScore: 0.7,
  },
  {
    id: 'en-preference-006',
    language: 'en',
    query: 'preferred text editor or IDE',
    expectedIds: ['en-mem-006'],
    expectedContent: ['The user switched from VS Code to Cursor as their primary editor.'],
    minScore: 0.65,
  },
  {
    id: 'en-factual-007',
    language: 'en',
    query: 'home address or location',
    expectedIds: ['en-mem-007'],
    expectedContent: ['The user lives in San Francisco, in the Mission District.'],
    minScore: 0.7,
  },
  {
    id: 'en-name-008',
    language: 'en',
    query: 'Who is the user\'s dentist?',
    expectedIds: ['en-mem-008'],
    expectedContent: ['Dr. Patel on Market Street is the user\'s dentist.'],
    minScore: 0.65,
  },
  {
    id: 'en-preference-009',
    language: 'en',
    query: 'dietary restrictions or food allergies',
    expectedIds: ['en-mem-009'],
    expectedContent: ['The user is lactose intolerant and avoids shellfish.'],
    minScore: 0.7,
  },
  {
    id: 'en-temporal-010',
    language: 'en',
    query: 'when is the next team offsite?',
    expectedIds: ['en-mem-010'],
    expectedContent: ['The engineering offsite is scheduled for the second week of April.'],
    minScore: 0.6,
  },
];

// =============================================================================
// Chinese (zh) - 10 cases
// =============================================================================

const ZH_CASES: GoldenTestCase[] = [
  {
    id: 'zh-factual-001',
    language: 'zh',
    query: '\u7528\u6237\u559c\u6b22\u4ec0\u4e48\u7f16\u7a0b\u8bed\u8a00\uff1f',
    expectedIds: ['zh-mem-001'],
    expectedContent: ['\u7528\u6237\u6700\u559c\u6b22\u7528Python\u505a\u6570\u636e\u5206\u6790\u9879\u76ee\u3002'],
    minScore: 0.7,
  },
  {
    id: 'zh-preference-002',
    language: 'zh',
    query: '\u65e9\u9910\u4e60\u60ef',
    expectedIds: ['zh-mem-002'],
    expectedContent: ['\u7528\u6237\u6bcf\u5929\u65e9\u4e0a\u5403\u8c46\u6d46\u548c\u6cb9\u6761\u3002'],
    minScore: 0.65,
  },
  {
    id: 'zh-name-003',
    language: 'zh',
    query: '\u8c01\u662f\u7528\u6237\u7684\u4e3b\u7ba1\uff1f',
    expectedIds: ['zh-mem-003'],
    expectedContent: ['\u7528\u6237\u7684\u76f4\u5c5e\u4e3b\u7ba1\u662f\u5f20\u4f1f\uff0c\u8d1f\u8d23\u540e\u7aef\u56e2\u961f\u3002'],
    minScore: 0.7,
  },
  {
    id: 'zh-temporal-004',
    language: 'zh',
    query: '\u4e0b\u6b21\u56de\u56fd\u8ba1\u5212',
    expectedIds: ['zh-mem-004'],
    expectedContent: ['\u7528\u6237\u8ba1\u5212\u6625\u8282\u671f\u95f4\u56de\u4e0a\u6d77\u63a2\u4eb2\u3002'],
    minScore: 0.6,
  },
  {
    id: 'zh-technical-005',
    language: 'zh',
    query: '\u670d\u52a1\u5668\u90e8\u7f72\u65b9\u6848',
    expectedIds: ['zh-mem-005'],
    expectedContent: ['\u56e2\u961f\u51b3\u5b9a\u4f7f\u7528Kubernetes\u90e8\u7f72\u5fae\u670d\u52a1\u67b6\u6784\u3002'],
    minScore: 0.7,
  },
  {
    id: 'zh-preference-006',
    language: 'zh',
    query: '\u559c\u6b22\u7684\u97f3\u4e50\u7c7b\u578b',
    expectedIds: ['zh-mem-006'],
    expectedContent: ['\u7528\u6237\u5de5\u4f5c\u65f6\u559c\u6b22\u542c\u53e4\u5178\u97f3\u4e50\u548c\u7235\u58eb\u4e50\u3002'],
    minScore: 0.65,
  },
  {
    id: 'zh-factual-007',
    language: 'zh',
    query: '\u7528\u6237\u4f4f\u5728\u54ea\u91cc\uff1f',
    expectedIds: ['zh-mem-007'],
    expectedContent: ['\u7528\u6237\u76ee\u524d\u4f4f\u5728\u5317\u4eac\u6d77\u6dc0\u533a\u3002'],
    minScore: 0.7,
  },
  {
    id: 'zh-name-008',
    language: 'zh',
    query: '\u7528\u6237\u5bb6\u91cc\u7684\u5ba0\u7269',
    expectedIds: ['zh-mem-008'],
    expectedContent: ['\u7528\u6237\u517b\u4e86\u4e00\u53ea\u6a58\u732b\uff0c\u53eb\u5c0f\u6a58\u3002'],
    minScore: 0.65,
  },
  {
    id: 'zh-preference-009',
    language: 'zh',
    query: '\u8fd0\u52a8\u4e60\u60ef\u548c\u5065\u8eab\u8ba1\u5212',
    expectedIds: ['zh-mem-009'],
    expectedContent: ['\u7528\u6237\u6bcf\u5468\u8dd1\u6b65\u4e09\u6b21\uff0c\u5468\u672b\u6253\u7fbd\u6bdb\u7403\u3002'],
    minScore: 0.65,
  },
  {
    id: 'zh-temporal-010',
    language: 'zh',
    query: '\u9879\u76ee\u622a\u6b62\u65e5\u671f',
    expectedIds: ['zh-mem-010'],
    expectedContent: ['\u5f53\u524d\u9879\u76ee\u7684\u622a\u6b62\u65e5\u671f\u662f\u4e09\u6708\u5e95\u3002'],
    minScore: 0.6,
  },
];

// =============================================================================
// Korean (ko) - 10 cases
// =============================================================================

const KO_CASES: GoldenTestCase[] = [
  {
    id: 'ko-factual-001',
    language: 'ko',
    query: '\uc0ac\uc6a9\uc790\uac00 \uc88b\uc544\ud558\ub294 \ud504\ub85c\uadf8\ub798\ubc0d \uc5b8\uc5b4\ub294?',
    expectedIds: ['ko-mem-001'],
    expectedContent: ['\uc0ac\uc6a9\uc790\ub294 \ud504\ub860\ud2b8\uc5d4\ub4dc \uac1c\ubc1c\uc5d0 React\uc640 TypeScript\ub97c \uc120\ud638\ud569\ub2c8\ub2e4.'],
    minScore: 0.7,
  },
  {
    id: 'ko-preference-002',
    language: 'ko',
    query: '\uc544\uce68\uc5d0 \ubb34\uc5c7\uc744 \ub9c8\uc2dc\ub098\uc694?',
    expectedIds: ['ko-mem-002'],
    expectedContent: ['\uc0ac\uc6a9\uc790\ub294 \ub9e4\uc77c \uc544\uce68 \uc544\uba54\ub9ac\uce74\ub178\ub97c \ub9c8\uc2ed\ub2c8\ub2e4.'],
    minScore: 0.65,
  },
  {
    id: 'ko-name-003',
    language: 'ko',
    query: '\ud300 \ub9ac\ub354\uac00 \ub204\uad6c\uc778\uac00\uc694?',
    expectedIds: ['ko-mem-003'],
    expectedContent: ['\ubc15\uc9c0\uc218 \ub9e4\ub2c8\uc800\uac00 \ubc31\uc5d4\ub4dc \ud300\uc744 \uc774\ub04c\uace0 \uc788\uc2b5\ub2c8\ub2e4.'],
    minScore: 0.7,
  },
  {
    id: 'ko-temporal-004',
    language: 'ko',
    query: '\ub2e4\uc74c \ud734\uac00 \uacc4\ud68d',
    expectedIds: ['ko-mem-004'],
    expectedContent: ['\uc0ac\uc6a9\uc790\ub294 \uc5ec\ub984\uc5d0 \uc81c\uc8fc\ub3c4\ub85c \uc5ec\ud589\uc744 \uacc4\ud68d\ud558\uace0 \uc788\uc2b5\ub2c8\ub2e4.'],
    minScore: 0.6,
  },
  {
    id: 'ko-technical-005',
    language: 'ko',
    query: 'API \uc778\uc99d \ubc29\uc2dd',
    expectedIds: ['ko-mem-005'],
    expectedContent: ['\uc0c8 API\ub294 JWT\uc640 OAuth 2.0\uc744 \uc0ac\uc6a9\ud558\uc5ec \uc778\uc99d\ud569\ub2c8\ub2e4.'],
    minScore: 0.7,
  },
  {
    id: 'ko-preference-006',
    language: 'ko',
    query: '\uc88b\uc544\ud558\ub294 \uc74c\uc2dd \uc885\ub958',
    expectedIds: ['ko-mem-006'],
    expectedContent: ['\uc0ac\uc6a9\uc790\ub294 \ub9e4\uc6b4 \uc74c\uc2dd\uc744 \uc88b\uc544\ud558\uace0 \ud2b9\ud788 \ub5a1\ubcf6\uc774\ub97c \uc990\uae41\ub2c8\ub2e4.'],
    minScore: 0.65,
  },
  {
    id: 'ko-factual-007',
    language: 'ko',
    query: '\uc0ac\uc6a9\uc790\uc758 \ud559\ub825',
    expectedIds: ['ko-mem-007'],
    expectedContent: ['\uc0ac\uc6a9\uc790\ub294 \uc11c\uc6b8\ub300\ud559\uad50 \ucef4\ud4e8\ud130\uacf5\ud559\uacfc\ub97c \uc878\uc5c5\ud588\uc2b5\ub2c8\ub2e4.'],
    minScore: 0.7,
  },
  {
    id: 'ko-name-008',
    language: 'ko',
    query: '\uc0ac\uc6a9\uc790\uc758 \uc560\uc644\ub3d9\ubb3c',
    expectedIds: ['ko-mem-008'],
    expectedContent: ['\uc0ac\uc6a9\uc790\ub294 \uace8\ub4e0\ub9ac\ud2b8\ub9ac\ubc84\ub97c \ud0a4\uc6b0\uace0 \uc788\uc73c\uba70 \uc774\ub984\uc740 \ubc14\ub2c8\uc785\ub2c8\ub2e4.'],
    minScore: 0.65,
  },
  {
    id: 'ko-preference-009',
    language: 'ko',
    query: '\uc120\ud638\ud558\ub294 \uad50\ud1b5 \uc218\ub2e8',
    expectedIds: ['ko-mem-009'],
    expectedContent: ['\uc0ac\uc6a9\uc790\ub294 \uc790\uc804\uac70\ub85c \ucd9c\ud1f4\uadfc\ud558\ub294 \uac83\uc744 \uc120\ud638\ud569\ub2c8\ub2e4.'],
    minScore: 0.65,
  },
  {
    id: 'ko-temporal-010',
    language: 'ko',
    query: '\ub2e4\uc74c \ud68c\uc758 \uc77c\uc815',
    expectedIds: ['ko-mem-010'],
    expectedContent: ['\uc8fc\uac04 \uc2a4\ud504\ub9b0\ud2b8 \uacc4\ud68d \ud68c\uc758\ub294 \ub9e4\uc8fc \uc6d4\uc694\uc77c \uc624\uc804 10\uc2dc\uc785\ub2c8\ub2e4.'],
    minScore: 0.6,
  },
];

// =============================================================================
// Japanese (ja) - 10 cases
// =============================================================================

const JA_CASES: GoldenTestCase[] = [
  {
    id: 'ja-factual-001',
    language: 'ja',
    query: '\u30e6\u30fc\u30b6\u30fc\u306e\u5f97\u610f\u306a\u30d7\u30ed\u30b0\u30e9\u30df\u30f3\u30b0\u8a00\u8a9e\u306f\uff1f',
    expectedIds: ['ja-mem-001'],
    expectedContent: ['\u30e6\u30fc\u30b6\u30fc\u306fRust\u3068Go\u3092\u4e3b\u306b\u4f7f\u3063\u3066\u30d0\u30c3\u30af\u30a8\u30f3\u30c9\u3092\u958b\u767a\u3057\u3066\u3044\u307e\u3059\u3002'],
    minScore: 0.7,
  },
  {
    id: 'ja-preference-002',
    language: 'ja',
    query: '\u304a\u6c17\u306b\u5165\u308a\u306e\u30e9\u30f3\u30c1\u30b9\u30dd\u30c3\u30c8',
    expectedIds: ['ja-mem-002'],
    expectedContent: ['\u30e6\u30fc\u30b6\u30fc\u306f\u6e0b\u8c37\u306e\u30e9\u30fc\u30e1\u30f3\u5c4b\u300c\u9ea6\u306e\u9053\u300d\u304c\u304a\u6c17\u306b\u5165\u308a\u3067\u3059\u3002'],
    minScore: 0.65,
  },
  {
    id: 'ja-name-003',
    language: 'ja',
    query: '\u30d7\u30ed\u30b8\u30a7\u30af\u30c8\u306e\u62c5\u5f53\u30c7\u30b6\u30a4\u30ca\u30fc\u306f\u8ab0\uff1f',
    expectedIds: ['ja-mem-003'],
    expectedContent: ['\u7530\u4e2d\u3086\u304b\u308a\u3055\u3093\u304cUI/UX\u30c7\u30b6\u30a4\u30f3\u3092\u62c5\u5f53\u3057\u3066\u3044\u307e\u3059\u3002'],
    minScore: 0.7,
  },
  {
    id: 'ja-temporal-004',
    language: 'ja',
    query: '\u6b21\u306e\u30ea\u30ea\u30fc\u30b9\u4e88\u5b9a',
    expectedIds: ['ja-mem-004'],
    expectedContent: ['\u6b21\u306e\u30e1\u30b8\u30e3\u30fc\u30ea\u30ea\u30fc\u30b9\u306f\u56db\u6708\u4e0a\u65ec\u306b\u4e88\u5b9a\u3055\u308c\u3066\u3044\u307e\u3059\u3002'],
    minScore: 0.6,
  },
  {
    id: 'ja-technical-005',
    language: 'ja',
    query: '\u30c6\u30b9\u30c8\u30d5\u30ec\u30fc\u30e0\u30ef\u30fc\u30af\u306e\u9078\u5b9a',
    expectedIds: ['ja-mem-005'],
    expectedContent: ['\u30c1\u30fc\u30e0\u306fVitest\u3068Playwright\u3092\u30c6\u30b9\u30c8\u30d5\u30ec\u30fc\u30e0\u30ef\u30fc\u30af\u3068\u3057\u3066\u63a1\u7528\u3057\u307e\u3057\u305f\u3002'],
    minScore: 0.7,
  },
  {
    id: 'ja-preference-006',
    language: 'ja',
    query: '\u4f11\u65e5\u306e\u904e\u3054\u3057\u65b9',
    expectedIds: ['ja-mem-006'],
    expectedContent: ['\u30e6\u30fc\u30b6\u30fc\u306f\u4f11\u65e5\u306b\u767b\u5c71\u3068\u5199\u771f\u64ae\u5f71\u3092\u697d\u3057\u3093\u3067\u3044\u307e\u3059\u3002'],
    minScore: 0.65,
  },
  {
    id: 'ja-factual-007',
    language: 'ja',
    query: '\u30e6\u30fc\u30b6\u30fc\u306e\u52e4\u52d9\u5148',
    expectedIds: ['ja-mem-007'],
    expectedContent: ['\u30e6\u30fc\u30b6\u30fc\u306f\u6771\u4eac\u306e\u30b9\u30bf\u30fc\u30c8\u30a2\u30c3\u30d7\u3067\u30a8\u30f3\u30b8\u30cb\u30a2\u3068\u3057\u3066\u50cd\u3044\u3066\u3044\u307e\u3059\u3002'],
    minScore: 0.7,
  },
  {
    id: 'ja-name-008',
    language: 'ja',
    query: '\u30e6\u30fc\u30b6\u30fc\u306e\u5bb6\u65cf\u69cb\u6210',
    expectedIds: ['ja-mem-008'],
    expectedContent: ['\u30e6\u30fc\u30b6\u30fc\u306f\u914d\u5076\u8005\u3068\u5a18\u4e00\u4eba\u306e\u4e09\u4eba\u5bb6\u65cf\u3067\u3059\u3002'],
    minScore: 0.65,
  },
  {
    id: 'ja-preference-009',
    language: 'ja',
    query: '\u597d\u304d\u306a\u97f3\u697d\u30b8\u30e3\u30f3\u30eb',
    expectedIds: ['ja-mem-009'],
    expectedContent: ['\u30e6\u30fc\u30b6\u30fc\u306f\u30b7\u30c6\u30a3\u30dd\u30c3\u30d7\u3068\u30a4\u30f3\u30c7\u30a3\u30ed\u30c3\u30af\u3092\u3088\u304f\u8074\u304d\u307e\u3059\u3002'],
    minScore: 0.65,
  },
  {
    id: 'ja-temporal-010',
    language: 'ja',
    query: '\u6b21\u306e\u6b6f\u533b\u8005\u306e\u4e88\u7d04',
    expectedIds: ['ja-mem-010'],
    expectedContent: ['\u6b6f\u533b\u8005\u306e\u4e88\u7d04\u306f\u4e8c\u6708\u5341\u4e94\u65e5\u306e\u5348\u5f8c\u4e09\u6642\u3067\u3059\u3002'],
    minScore: 0.6,
  },
];

// =============================================================================
// Hindi (hi) - 10 cases
// =============================================================================

const HI_CASES: GoldenTestCase[] = [
  {
    id: 'hi-factual-001',
    language: 'hi',
    query: '\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0915\u094c\u0928 \u0938\u0940 \u092a\u094d\u0930\u094b\u0917\u094d\u0930\u093e\u092e\u093f\u0902\u0917 \u092d\u093e\u0937\u093e \u092a\u0938\u0902\u0926 \u0915\u0930\u0924\u0947 \u0939\u0948\u0902?',
    expectedIds: ['hi-mem-001'],
    expectedContent: ['\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e JavaScript \u0914\u0930 Python \u092e\u0947\u0902 \u0935\u0947\u092c \u0910\u092a\u094d\u0932\u093f\u0915\u0947\u0936\u0928 \u092c\u0928\u093e\u0924\u0947 \u0939\u0948\u0902\u0964'],
    minScore: 0.7,
  },
  {
    id: 'hi-preference-002',
    language: 'hi',
    query: '\u092a\u0938\u0902\u0926\u0940\u0926\u093e \u0916\u093e\u0928\u093e',
    expectedIds: ['hi-mem-002'],
    expectedContent: ['\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0915\u094b \u0926\u0915\u094d\u0937\u093f\u0923 \u092d\u093e\u0930\u0924\u0940\u092f \u0916\u093e\u0928\u093e \u092c\u0939\u0941\u0924 \u092a\u0938\u0902\u0926 \u0939\u0948\u0964'],
    minScore: 0.65,
  },
  {
    id: 'hi-name-003',
    language: 'hi',
    query: '\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0915\u0947 \u092e\u0948\u0928\u0947\u091c\u0930 \u0915\u094c\u0928 \u0939\u0948\u0902?',
    expectedIds: ['hi-mem-003'],
    expectedContent: ['\u0905\u0928\u094d\u0915\u093f\u0924 \u0936\u0930\u094d\u092e\u093e \u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0915\u0947 \u091f\u0940\u092e \u0932\u0940\u0921 \u0939\u0948\u0902\u0964'],
    minScore: 0.7,
  },
  {
    id: 'hi-temporal-004',
    language: 'hi',
    query: '\u0905\u0917\u0932\u0940 \u091b\u0941\u091f\u094d\u091f\u0940 \u0915\u0940 \u092f\u094b\u091c\u0928\u093e',
    expectedIds: ['hi-mem-004'],
    expectedContent: ['\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0926\u093f\u0935\u093e\u0932\u0940 \u092e\u0947\u0902 \u0930\u093e\u091c\u0938\u094d\u0925\u093e\u0928 \u0918\u0942\u092e\u0928\u0947 \u091c\u093e\u0928\u093e \u091a\u093e\u0939\u0924\u0947 \u0939\u0948\u0902\u0964'],
    minScore: 0.6,
  },
  {
    id: 'hi-technical-005',
    language: 'hi',
    query: '\u0915\u094d\u0932\u093e\u0909\u0921 \u0938\u0947\u0935\u093e \u092a\u094d\u0930\u0926\u093e\u0924\u093e',
    expectedIds: ['hi-mem-005'],
    expectedContent: ['\u091f\u0940\u092e AWS \u0914\u0930 Vercel \u0915\u093e \u0909\u092a\u092f\u094b\u0917 \u0915\u0930\u0924\u0940 \u0939\u0948 \u0921\u093f\u092a\u094d\u0932\u0949\u092f\u092e\u0947\u0902\u091f \u0915\u0947 \u0932\u093f\u090f\u0964'],
    minScore: 0.7,
  },
  {
    id: 'hi-preference-006',
    language: 'hi',
    query: '\u092a\u0938\u0902\u0926\u0940\u0926\u093e \u0915\u093f\u0924\u093e\u092c\u0947\u0902',
    expectedIds: ['hi-mem-006'],
    expectedContent: ['\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0935\u093f\u091c\u094d\u091e\u093e\u0928 \u0915\u0925\u093e \u0914\u0930 \u0907\u0924\u093f\u0939\u093e\u0938 \u0915\u0940 \u0915\u093f\u0924\u093e\u092c\u0947\u0902 \u092a\u0922\u093c\u0924\u0947 \u0939\u0948\u0902\u0964'],
    minScore: 0.65,
  },
  {
    id: 'hi-factual-007',
    language: 'hi',
    query: '\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0915\u0939\u093e\u0901 \u0930\u0939\u0924\u0947 \u0939\u0948\u0902?',
    expectedIds: ['hi-mem-007'],
    expectedContent: ['\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u092c\u0902\u0917\u0932\u094c\u0930 \u092e\u0947\u0902 \u0915\u094b\u0930\u092e\u0902\u0917\u0932\u093e \u0907\u0932\u093e\u0915\u0947 \u092e\u0947\u0902 \u0930\u0939\u0924\u0947 \u0939\u0948\u0902\u0964'],
    minScore: 0.7,
  },
  {
    id: 'hi-name-008',
    language: 'hi',
    query: '\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0915\u093e \u0938\u092c\u0938\u0947 \u0905\u091a\u094d\u091b\u093e \u0926\u094b\u0938\u094d\u0924',
    expectedIds: ['hi-mem-008'],
    expectedContent: ['\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0915\u093e \u0938\u092c\u0938\u0947 \u0905\u091a\u094d\u091b\u093e \u0926\u094b\u0938\u094d\u0924 \u0930\u093e\u0939\u0941\u0932 \u0939\u0948 \u091c\u094b \u0926\u093f\u0932\u094d\u0932\u0940 \u092e\u0947\u0902 \u0930\u0939\u0924\u093e \u0939\u0948\u0964'],
    minScore: 0.65,
  },
  {
    id: 'hi-preference-009',
    language: 'hi',
    query: '\u092a\u0938\u0902\u0926\u0940\u0926\u093e \u0935\u094d\u092f\u093e\u092f\u093e\u092e',
    expectedIds: ['hi-mem-009'],
    expectedContent: ['\u0909\u092a\u092f\u094b\u0917\u0915\u0930\u094d\u0924\u093e \u0938\u0941\u092c\u0939 \u092f\u094b\u0917 \u0915\u0930\u0924\u0947 \u0939\u0948\u0902 \u0914\u0930 \u0936\u093e\u092e \u0915\u094b \u0926\u094c\u0921\u093c\u0924\u0947 \u0939\u0948\u0902\u0964'],
    minScore: 0.65,
  },
  {
    id: 'hi-temporal-010',
    language: 'hi',
    query: '\u0905\u0917\u0932\u0940 \u0921\u0949\u0915\u094d\u091f\u0930 \u0915\u0940 \u0905\u092a\u0949\u0907\u0902\u091f\u092e\u0947\u0902\u091f',
    expectedIds: ['hi-mem-010'],
    expectedContent: ['\u0921\u0949\u0915\u094d\u091f\u0930 \u0915\u0940 \u0905\u092a\u0949\u0907\u0902\u091f\u092e\u0947\u0902\u091f \u0905\u0917\u0932\u0947 \u092e\u0939\u0940\u0928\u0947 \u0915\u0940 \u092a\u0902\u0926\u094d\u0930\u0939 \u0924\u093e\u0930\u0940\u0916 \u0915\u094b \u0939\u0948\u0964'],
    minScore: 0.6,
  },
];

// =============================================================================
// Arabic (ar) - 10 cases
// =============================================================================

const AR_CASES: GoldenTestCase[] = [
  {
    id: 'ar-factual-001',
    language: 'ar',
    query: '\u0645\u0627 \u0644\u063a\u0629 \u0627\u0644\u0628\u0631\u0645\u062c\u0629 \u0627\u0644\u0645\u0641\u0636\u0644\u0629 \u0644\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u061f',
    expectedIds: ['ar-mem-001'],
    expectedContent: ['\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u064a\u0641\u0636\u0644 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 TypeScript \u0648Python \u0641\u064a \u0645\u0634\u0627\u0631\u064a\u0639\u0647.'],
    minScore: 0.7,
  },
  {
    id: 'ar-preference-002',
    language: 'ar',
    query: '\u0627\u0644\u0645\u0634\u0631\u0648\u0628 \u0627\u0644\u0645\u0641\u0636\u0644',
    expectedIds: ['ar-mem-002'],
    expectedContent: ['\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u064a\u0634\u0631\u0628 \u0627\u0644\u0634\u0627\u064a \u0627\u0644\u0623\u062e\u0636\u0631 \u0643\u0644 \u0635\u0628\u0627\u062d.'],
    minScore: 0.65,
  },
  {
    id: 'ar-name-003',
    language: 'ar',
    query: '\u0645\u0646 \u0647\u0648 \u0645\u062f\u064a\u0631 \u0627\u0644\u0645\u0634\u0631\u0648\u0639\u061f',
    expectedIds: ['ar-mem-003'],
    expectedContent: ['\u0623\u062d\u0645\u062f \u062e\u0627\u0644\u062f \u0647\u0648 \u0645\u062f\u064a\u0631 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0627\u0644\u062d\u0627\u0644\u064a.'],
    minScore: 0.7,
  },
  {
    id: 'ar-temporal-004',
    language: 'ar',
    query: '\u0645\u0648\u0639\u062f \u0627\u0644\u0633\u0641\u0631 \u0627\u0644\u0642\u0627\u062f\u0645',
    expectedIds: ['ar-mem-004'],
    expectedContent: ['\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u064a\u062e\u0637\u0637 \u0644\u0644\u0633\u0641\u0631 \u0625\u0644\u0649 \u0627\u0633\u0637\u0646\u0628\u0648\u0644 \u0641\u064a \u0634\u0647\u0631 \u0645\u0627\u064a\u0648.'],
    minScore: 0.6,
  },
  {
    id: 'ar-technical-005',
    language: 'ar',
    query: '\u0628\u0646\u064a\u0629 \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',
    expectedIds: ['ar-mem-005'],
    expectedContent: ['\u0627\u0644\u0641\u0631\u064a\u0642 \u064a\u0633\u062a\u062e\u062f\u0645 PostgreSQL \u0645\u0639 Supabase \u0644\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.'],
    minScore: 0.7,
  },
  {
    id: 'ar-preference-006',
    language: 'ar',
    query: '\u0627\u0644\u0647\u0648\u0627\u064a\u0629 \u0627\u0644\u0645\u0641\u0636\u0644\u0629',
    expectedIds: ['ar-mem-006'],
    expectedContent: ['\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u064a\u0647\u0648\u0649 \u0627\u0644\u0631\u0633\u0645 \u0628\u0627\u0644\u0623\u0644\u0648\u0627\u0646 \u0627\u0644\u0645\u0627\u0626\u064a\u0629 \u0641\u064a \u0648\u0642\u062a \u0627\u0644\u0641\u0631\u0627\u063a.'],
    minScore: 0.65,
  },
  {
    id: 'ar-factual-007',
    language: 'ar',
    query: '\u0623\u064a\u0646 \u064a\u0639\u064a\u0634 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u061f',
    expectedIds: ['ar-mem-007'],
    expectedContent: ['\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u064a\u0639\u064a\u0634 \u0641\u064a \u0645\u062f\u064a\u0646\u0629 \u062f\u0628\u064a \u0641\u064a \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062a.'],
    minScore: 0.7,
  },
  {
    id: 'ar-name-008',
    language: 'ar',
    query: '\u0645\u0646 \u0647\u0648 \u0637\u0628\u064a\u0628 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u061f',
    expectedIds: ['ar-mem-008'],
    expectedContent: ['\u0627\u0644\u062f\u0643\u062a\u0648\u0631\u0629 \u0641\u0627\u0637\u0645\u0629 \u0639\u0644\u064a \u0647\u064a \u0637\u0628\u064a\u0628\u0629 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u0639\u0627\u0645\u0629.'],
    minScore: 0.65,
  },
  {
    id: 'ar-preference-009',
    language: 'ar',
    query: '\u0646\u0638\u0627\u0645 \u063a\u0630\u0627\u0626\u064a \u0623\u0648 \u062d\u0645\u064a\u0629',
    expectedIds: ['ar-mem-009'],
    expectedContent: ['\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 \u064a\u062a\u0628\u0639 \u0646\u0638\u0627\u0645\u0627\u064b \u063a\u0630\u0627\u0626\u064a\u0627\u064b \u0646\u0628\u0627\u062a\u064a\u0627\u064b \u0648\u064a\u062a\u062c\u0646\u0628 \u0627\u0644\u063a\u0644\u0648\u062a\u064a\u0646.'],
    minScore: 0.65,
  },
  {
    id: 'ar-temporal-010',
    language: 'ar',
    query: '\u0645\u0648\u0639\u062f \u0627\u0644\u0627\u062c\u062a\u0645\u0627\u0639 \u0627\u0644\u0642\u0627\u062f\u0645',
    expectedIds: ['ar-mem-010'],
    expectedContent: ['\u0627\u062c\u062a\u0645\u0627\u0639 \u0627\u0644\u0641\u0631\u064a\u0642 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064a \u0643\u0644 \u064a\u0648\u0645 \u0623\u062d\u062f \u0627\u0644\u0633\u0627\u0639\u0629 \u0627\u0644\u0639\u0627\u0634\u0631\u0629 \u0635\u0628\u0627\u062d\u0627\u064b.'],
    minScore: 0.6,
  },
];

// =============================================================================
// Aggregate & Export
// =============================================================================

/**
 * All golden test cases across all 6 languages (60 total)
 */
export const ALL_GOLDEN_CASES: GoldenTestCase[] = [
  ...EN_CASES,
  ...ZH_CASES,
  ...KO_CASES,
  ...JA_CASES,
  ...HI_CASES,
  ...AR_CASES,
];

/**
 * Golden cases grouped by language
 */
export const GOLDEN_CASES_BY_LANGUAGE: Record<string, GoldenTestCase[]> = {
  en: EN_CASES,
  zh: ZH_CASES,
  ko: KO_CASES,
  ja: JA_CASES,
  hi: HI_CASES,
  ar: AR_CASES,
};

/**
 * Supported languages in the golden set
 */
export const GOLDEN_SET_LANGUAGES = ['en', 'zh', 'ko', 'ja', 'hi', 'ar'] as const;
export type GoldenSetLanguage = (typeof GOLDEN_SET_LANGUAGES)[number];

// =============================================================================
// Conversion Utilities
// =============================================================================

/**
 * Convert golden test cases to EvalCase format for use with MultilingualEval.
 *
 * Maps golden set fields to the EvalCase interface used by the evaluation
 * harness, tagging each case with its language and query type for breakdown
 * reporting.
 */
export function toEvalCases(goldenCases: GoldenTestCase[]): EvalCase[] {
  return goldenCases.map((gc) => {
    // Derive tags from the test case ID pattern: {lang}-{type}-{num}
    const parts = gc.id.split('-');
    const queryType = parts[1] || 'general';

    return {
      id: gc.id,
      query: gc.query,
      queryLanguage: gc.language,
      expectedIds: gc.expectedIds,
      tags: [gc.language, queryType, 'golden-set'],
      description: `Golden set: ${gc.language} ${queryType} query`,
    };
  });
}

/**
 * Convert all golden cases to EvalCase format
 */
export function allAsEvalCases(): EvalCase[] {
  return toEvalCases(ALL_GOLDEN_CASES);
}

/**
 * Get golden cases for a specific language, converted to EvalCase format
 */
export function evalCasesForLanguage(language: GoldenSetLanguage): EvalCase[] {
  const cases = GOLDEN_CASES_BY_LANGUAGE[language];
  if (!cases) {
    throw new Error(`No golden set for language: ${language}`);
  }
  return toEvalCases(cases);
}

/**
 * Validate that a golden test case has the required fields populated.
 * Returns an array of validation error messages (empty if valid).
 */
export function validateGoldenCase(gc: GoldenTestCase): string[] {
  const errors: string[] = [];

  if (!gc.id) errors.push('Missing id');
  if (!gc.language) errors.push('Missing language');
  if (!gc.query) errors.push('Missing query');
  if (!gc.expectedContent || gc.expectedContent.length === 0) {
    errors.push('Missing expectedContent');
  }
  if (gc.minScore < 0 || gc.minScore > 1) {
    errors.push(`Invalid minScore: ${gc.minScore} (must be 0-1)`);
  }

  return errors;
}

/**
 * Validate all golden cases and return any errors found.
 */
export function validateAllGoldenCases(): {
  valid: boolean;
  errors: Array<{ caseId: string; errors: string[] }>;
} {
  const allErrors: Array<{ caseId: string; errors: string[] }> = [];

  for (const gc of ALL_GOLDEN_CASES) {
    const caseErrors = validateGoldenCase(gc);
    if (caseErrors.length > 0) {
      allErrors.push({ caseId: gc.id, errors: caseErrors });
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
