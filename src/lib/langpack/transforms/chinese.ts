/**
 * Chinese Script Transform
 *
 * Handles conversion between Simplified Chinese (zh-Hans) and
 * Traditional Chinese (zh-Hant) using OpenCC-compatible rules.
 *
 * Used for cross-script search: a query in Traditional Chinese
 * should match memories stored in Simplified Chinese and vice versa.
 *
 * @module lib/langpack/transforms/chinese
 */

// =============================================================================
// Simplified ↔ Traditional Character Mapping
// =============================================================================

// Core mapping table: Simplified → Traditional
// This is a subset of the most common conversions.
// For production, consider importing full OpenCC dictionaries.
const S2T_MAP: Record<string, string> = {
  '国': '國', '会': '會', '发': '發', '机': '機', '关': '關',
  '学': '學', '东': '東', '书': '書', '长': '長', '万': '萬',
  '个': '個', '义': '義', '乐': '樂', '为': '為', '举': '舉',
  '么': '麼', '云': '雲', '产': '產', '亲': '親', '仅': '僅',
  '从': '從', '众': '眾', '传': '傳', '伤': '傷', '体': '體',
  '佣': '傭', '侠': '俠', '侣': '侶', '俭': '儉', '优': '優',
  '价': '價', '华': '華', '协': '協', '单': '單', '卫': '衛',
  '历': '歷', '厅': '廳', '压': '壓', '厌': '厭', '参': '參',
  '双': '雙', '变': '變', '叶': '葉', '号': '號', '听': '聽',
  '启': '啟', '员': '員', '问': '問', '团': '團', '场': '場',
  '块': '塊', '声': '聲', '壮': '壯', '处': '處', '备': '備',
  '复': '復', '头': '頭', '夺': '奪', '奋': '奮', '妇': '婦',
  '妈': '媽', '孙': '孫', '对': '對', '导': '導', '尝': '嘗',
  '将': '將', '尔': '爾', '层': '層', '岁': '歲', '币': '幣',
  '师': '師', '带': '帶', '归': '歸', '当': '當', '录': '錄',
  '总': '總', '战': '戰', '扩': '擴', '执': '執', '护': '護',
  '报': '報', '拟': '擬', '择': '擇', '担': '擔', '据': '據',
  '损': '損', '换': '換', '搜': '搜', '摄': '攝', '数': '數',
  '斗': '鬥', '断': '斷', '无': '無', '旧': '舊', '时': '時',
  '显': '顯', '晋': '晉', '术': '術', '权': '權', '条': '條',
  '来': '來', '极': '極', '构': '構', '标': '標', '样': '樣',
  '树': '樹', '桥': '橋', '检': '檢', '业': '業', '楼': '樓',
  '欢': '歡', '武': '武', '残': '殘', '毕': '畢', '气': '氣',
  '汇': '匯', '汉': '漢', '决': '決', '没': '沒', '沟': '溝',
  '浅': '淺', '测': '測', '济': '濟', '浊': '濁', '涨': '漲',
  '灯': '燈', '灵': '靈', '炉': '爐', '热': '熱', '爱': '愛',
  '牺': '犧', '犹': '猶', '独': '獨', '献': '獻', '现': '現',
  '环': '環', '画': '畫', '异': '異', '疗': '療', '盘': '盤',
  '监': '監', '盐': '鹽', '碍': '礙', '确': '確', '离': '離',
  '积': '積', '称': '稱', '种': '種', '笔': '筆', '类': '類',
  '粮': '糧', '约': '約', '纪': '紀', '纯': '純', '纲': '綱',
  '纳': '納', '纵': '縱', '纷': '紛', '纸': '紙', '练': '練',
  '组': '組', '细': '細', '经': '經', '结': '結', '给': '給',
  '统': '統', '绝': '絕', '继': '繼', '绩': '績', '续': '續',
  '维': '維', '综': '綜', '缩': '縮', '网': '網', '罗': '羅',
  '联': '聯', '职': '職', '胜': '勝', '脑': '腦', '脸': '臉',
  '节': '節', '范': '範', '荣': '榮', '药': '藥', '营': '營',
  '虑': '慮', '虽': '雖', '行': '行', '补': '補', '观': '觀',
  '规': '規', '觉': '覺', '览': '覽', '计': '計', '订': '訂',
  '认': '認', '让': '讓', '训': '訓', '议': '議', '设': '設',
  '访': '訪', '证': '證', '评': '評', '识': '識', '详': '詳',
  '语': '語', '说': '說', '请': '請', '论': '論', '调': '調',
  '谈': '談', '谢': '謝', '质': '質', '贝': '貝', '费': '費',
  '赛': '賽', '赵': '趙', '输': '輸', '边': '邊', '达': '達',
  '迁': '遷', '运': '運', '进': '進', '远': '遠', '连': '連',
  '迟': '遲', '适': '適', '选': '選', '递': '遞', '邮': '郵',
  '释': '釋', '钟': '鐘', '钱': '錢', '铁': '鐵', '银': '銀',
  '销': '銷', '锁': '鎖', '锡': '錫', '错': '錯', '键': '鍵',
  '锦': '錦', '门': '門', '闭': '閉', '间': '間', '队': '隊',
  '阳': '陽', '阵': '陣', '阶': '階', '险': '險', '随': '隨',
  '难': '難', '集': '集', '零': '零', '电': '電', '需': '需',
  '震': '震', '面': '面', '韩': '韓', '页': '頁', '须': '須',
  '顾': '顧', '风': '風', '马': '馬', '验': '驗', '鸡': '雞',
  '齐': '齊', '龙': '龍', '龟': '龜',
};

// Build reverse mapping: Traditional → Simplified
const T2S_MAP: Record<string, string> = {};
for (const [s, t] of Object.entries(S2T_MAP)) {
  T2S_MAP[t] = s;
}

// =============================================================================
// Transform Functions
// =============================================================================

/**
 * Convert Simplified Chinese to Traditional Chinese
 */
export function simplifiedToTraditional(text: string): string {
  let result = '';
  for (const char of text) {
    result += S2T_MAP[char] || char;
  }
  return result;
}

/**
 * Convert Traditional Chinese to Simplified Chinese
 */
export function traditionalToSimplified(text: string): string {
  let result = '';
  for (const char of text) {
    result += T2S_MAP[char] || char;
  }
  return result;
}

/**
 * Generate all script variants for a Chinese text.
 * Returns both simplified and traditional forms.
 */
export function getChineseVariants(text: string): {
  simplified: string;
  traditional: string;
} {
  // Detect if text is mostly simplified or traditional
  let simplifiedCount = 0;
  let traditionalCount = 0;

  for (const char of text) {
    if (S2T_MAP[char]) simplifiedCount++;
    if (T2S_MAP[char]) traditionalCount++;
  }

  if (simplifiedCount >= traditionalCount) {
    // Input is likely simplified
    return {
      simplified: text,
      traditional: simplifiedToTraditional(text),
    };
  } else {
    // Input is likely traditional
    return {
      simplified: traditionalToSimplified(text),
      traditional: text,
    };
  }
}

/**
 * Check if text contains Chinese characters
 */
export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

/**
 * Detect if Chinese text is simplified or traditional
 */
export function detectChineseVariant(text: string): 'simplified' | 'traditional' | 'unknown' {
  let simplifiedCount = 0;
  let traditionalCount = 0;

  for (const char of text) {
    if (S2T_MAP[char]) simplifiedCount++;
    if (T2S_MAP[char]) traditionalCount++;
  }

  if (simplifiedCount === 0 && traditionalCount === 0) return 'unknown';
  if (simplifiedCount > traditionalCount) return 'simplified';
  if (traditionalCount > simplifiedCount) return 'traditional';
  return 'unknown';
}
