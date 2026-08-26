function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortenClaudeModel(model: string): string {
  if (!model) return '(unknown)';

  // 自定义模型名映射
  const CUSTOM_NAMES: Record<string, string> = {
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'deepseek-v4-flash': 'DeepSeek V4 Flash',
    'deepseek-v4-flash-vision-exp': 'DeepSeek V4 Flash Vision Experimental',
    'kimi-for-coding': 'Kimi K2.5',
    'k2p6': 'Kimi K2.6',
  };
  if (CUSTOM_NAMES[model]) return CUSTOM_NAMES[model];

  let m = model
    .replace(/-(\d{8})$/, '')
    .replace(/^(vertex_ai|bedrock|anthropic)\//, '');
  m = m.replace(/^claude-/, '');
  const parts = m.split('-');
  if (parts.length >= 2) {
    const family = parts[0];
    const version = parts.slice(1).join('.');
    return capitalize(family) + ' ' + version;
  }
  return capitalize(m.replace(/-/g, ' '));
}
