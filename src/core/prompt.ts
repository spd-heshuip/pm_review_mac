export interface TaskInput {
  requirementId: string;
  tapdUrl: string;
  notes: string;
}

export function hasMaterial(input: TaskInput): boolean {
  return Boolean(input.requirementId.trim() || input.tapdUrl.trim() || input.notes.trim());
}

export function taskTitle(input: TaskInput): string {
  if (input.requirementId.trim()) return input.requirementId.trim();
  if (input.tapdUrl.trim()) return input.tapdUrl.trim();
  const notes = input.notes.trim();
  return notes.length > 40 ? `${notes.slice(0, 40)}…` : notes;
}

export function buildPrompt(input: TaskInput): string {
  const lines = [
    "/tapd-requirement-clarity-review",
    "",
    "必须读取并严格遵循仓库内 .cursor/skills/tapd-requirement-clarity-review/SKILL.md。",
    "按该 Skill 判断 PRD 前现状调研或 PRD 后需求审查，并输出完整产品语言 Markdown 报告。",
    "把最终报告写入 Cloud Agent artifacts，文件名遵循该 Skill 的报告命名规则。",
    "不要 commit，不要 push，不要创建 PR，不要修改业务代码、TAPD、graphify 索引、设计文档或实施计划。",
    "",
    "产品经理材料：",
  ];
  if (input.requirementId.trim()) lines.push(`需求 ID：${input.requirementId.trim()}`);
  if (input.tapdUrl.trim()) lines.push(`TAPD 链接：${input.tapdUrl.trim()}`);
  if (input.notes.trim()) lines.push(`补充说明：${input.notes.trim()}`);
  return lines.join("\n");
}
