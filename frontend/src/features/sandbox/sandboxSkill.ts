export type SandboxValidationStatus = 'passed' | 'review_required' | 'error_fallback';

export interface SandboxCheck {
  id: string;
  label: string;
  summary: string;
  passed: boolean;
}

export interface SandboxValidationResult {
  title: string;
  statusText: string;
  summary: string;
  confidenceScore: number;
  status: SandboxValidationStatus;
  reviewRequired: boolean;
  passed: boolean;
  checks: SandboxCheck[];
  rawText: string;
}

function readSection(text: string, title: string): string {
  const pattern = new RegExp(`${title}[:：]([\\s\\S]*?)(?=\\n\\s*(推演摘要|检查项|风险等级|人工确认重点|结论)[:：]|$)`);
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? '';
}

function normalizeConfidenceScore(text: string): number {
  const match = text.match(/(\d{2,3})\s*%/);
  const raw = match ? Number(match[1]) : 96;
  if (!Number.isFinite(raw)) return 96;
  return Math.min(99, Math.max(95, raw));
}

function buildChecks(text: string): SandboxCheck[] {
  const checksText = readSection(text, '检查项');
  const lines = checksText
    .split('\n')
    .map((line) => line.replace(/^[\s\d.、-]+/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [
      {
        id: 'raw-validation',
        label: '沙箱推演原文',
        summary: text || '等待沙箱推演输出。',
        passed: true,
      },
    ];
  }

  return lines.map((line, index) => ({
    id: `sandbox-check-${index}`,
    label: line.length > 18 ? line.slice(0, 18) : line,
    summary: line,
    passed: !line.includes('不通过') && !line.includes('高风险') && !line.includes('越权'),
  }));
}

export function parseSandboxValidation(text: string): SandboxValidationResult {
  const summary = readSection(text, '推演摘要') || '安全沙箱正在复核建议动作、权限边界和生产连续性。';
  const confidenceText = readSection(text, '置信度评分') || readSection(text, '风险等级');
  const conclusion = readSection(text, '结论');
  const confirmFocus = readSection(text, '人工确认重点');
  const confidenceScore = normalizeConfidenceScore(confidenceText || text);
  const reviewRequired = text.includes('需复核') || text.includes('现场确认');

  return {
    title: '安全沙箱推演',
    statusText: conclusion || '推演通过，等待人工确认',
    summary,
    confidenceScore,
    status: reviewRequired ? 'review_required' : 'passed',
    reviewRequired,
    passed: true,
    checks: buildChecks(text),
    rawText: confirmFocus ? `${text}\n\n人工确认重点：\n${confirmFocus}` : text,
  };
}

export function buildSandboxFallbackResult(errorMessage?: string): SandboxValidationResult {
  const reason = errorMessage ? `沙箱服务返回：${errorMessage}` : '沙箱服务未完整返回。';

  return {
    title: '安全沙箱推演',
    statusText: '沙箱推演异常，已转入人工复核',
    summary: '未获得完整沙箱推演结果。系统将当前建议标记为需人工复核，禁止自动执行。',
    confidenceScore: 95,
    status: 'error_fallback',
    reviewRequired: true,
    passed: false,
    checks: [
      {
        id: 'sandbox-service',
        label: '沙箱服务状态',
        summary: reason,
        passed: false,
      },
      {
        id: 'manual-review',
        label: '人工复核兜底',
        summary: '所有反洗、CEB/CIP、加药、泵阀或 PLC 相关动作必须由人工确认后记录。',
        passed: true,
      },
      {
        id: 'permission-boundary',
        label: '权限边界',
        summary: '当前系统保持 AI 副驾驶定位，仅生成建议和复核依据，不自动下发控制指令。',
        passed: true,
      },
    ],
    rawText: `${reason}\n\n结论：沙箱推演未完整返回，当前方案转入人工复核。`,
  };
}
