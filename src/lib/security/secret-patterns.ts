/**
 * Secret Detection Patterns
 *
 * Extended patterns for detecting secrets, API keys, tokens, and credentials.
 * Used alongside PII patterns for comprehensive security scanning.
 */

// ============================================
// Secret Types
// ============================================

export type SecretType =
  // API Keys
  | 'openai_api_key'
  | 'anthropic_api_key'
  | 'google_api_key'
  | 'azure_api_key'
  | 'cohere_api_key'
  | 'huggingface_token'
  | 'seizn_api_key'
  // Cloud Provider Keys
  | 'aws_access_key'
  | 'aws_secret_key'
  | 'gcp_api_key'
  | 'gcp_service_account'
  | 'azure_storage_key'
  | 'azure_connection_string'
  | 'digitalocean_token'
  | 'heroku_api_key'
  | 'vercel_token'
  | 'netlify_token'
  // Payment & Financial
  | 'stripe_api_key'
  | 'stripe_webhook_secret'
  | 'paypal_client_secret'
  | 'square_access_token'
  // Authentication
  | 'github_token'
  | 'github_oauth'
  | 'gitlab_token'
  | 'bitbucket_token'
  | 'npm_token'
  | 'pypi_token'
  | 'dockerhub_token'
  // Database
  | 'postgres_connection_string'
  | 'mysql_connection_string'
  | 'mongodb_connection_string'
  | 'redis_url'
  // Messaging
  | 'slack_token'
  | 'slack_webhook'
  | 'discord_token'
  | 'discord_webhook'
  | 'telegram_bot_token'
  | 'twilio_api_key'
  | 'sendgrid_api_key'
  | 'mailgun_api_key'
  // JWT & Auth Tokens
  | 'jwt'
  | 'bearer_token'
  | 'basic_auth'
  // Certificates & Keys
  | 'private_key_rsa'
  | 'private_key_ec'
  | 'private_key_pem'
  | 'ssh_private_key'
  | 'pgp_private_key'
  // Generic
  | 'generic_api_key'
  | 'generic_secret'
  | 'password_in_url';

// ============================================
// Pattern Definition
// ============================================

export interface SecretPatternDefinition {
  type: SecretType;
  pattern: RegExp;
  confidence: number;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  validator?: (match: string) => boolean;
  rotationUrl?: string;
}

// ============================================
// Secret Patterns
// ============================================

export const SECRET_PATTERNS: SecretPatternDefinition[] = [
  // ===========================================
  // AI Provider API Keys
  // ===========================================
  {
    type: 'openai_api_key',
    pattern: /\bsk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}\b/g,
    confidence: 0.99,
    description: 'OpenAI API Key',
    severity: 'critical',
    rotationUrl: 'https://platform.openai.com/api-keys',
  },
  {
    type: 'openai_api_key',
    pattern: /\bsk-proj-[A-Za-z0-9_-]{48,}\b/g,
    confidence: 0.99,
    description: 'OpenAI Project API Key',
    severity: 'critical',
    rotationUrl: 'https://platform.openai.com/api-keys',
  },
  {
    type: 'anthropic_api_key',
    pattern: /\bsk-ant-api[0-9]{2}-[A-Za-z0-9_-]{93}\b/g,
    confidence: 0.99,
    description: 'Anthropic API Key',
    severity: 'critical',
    rotationUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    type: 'google_api_key',
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g,
    confidence: 0.95,
    description: 'Google API Key',
    severity: 'high',
    rotationUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    type: 'cohere_api_key',
    pattern: /\b[A-Za-z0-9]{40}\b/g,
    confidence: 0.5, // Low confidence, needs context
    description: 'Potential Cohere API Key',
    severity: 'high',
    validator: (match) => /^[a-zA-Z0-9]{40}$/.test(match),
  },
  {
    type: 'huggingface_token',
    pattern: /\bhf_[A-Za-z0-9]{34,}\b/g,
    confidence: 0.99,
    description: 'Hugging Face Token',
    severity: 'high',
    rotationUrl: 'https://huggingface.co/settings/tokens',
  },
  {
    type: 'seizn_api_key',
    pattern: /\bszn_[A-Za-z0-9_-]{32,}\b/g,
    confidence: 0.99,
    description: 'Seizn API Key',
    severity: 'critical',
  },

  // ===========================================
  // Cloud Provider Keys
  // ===========================================
  {
    type: 'aws_access_key',
    pattern: /\b(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/g,
    confidence: 0.98,
    description: 'AWS Access Key ID',
    severity: 'critical',
    rotationUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
  },
  {
    type: 'aws_secret_key',
    pattern: /\b[A-Za-z0-9/+=]{40}\b/g,
    confidence: 0.6, // Needs context
    description: 'Potential AWS Secret Access Key',
    severity: 'critical',
    validator: (match) => {
      // Check if it looks like base64 and has appropriate chars
      return /^[A-Za-z0-9/+=]{40}$/.test(match) && match.includes('/');
    },
  },
  {
    type: 'gcp_api_key',
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g,
    confidence: 0.95,
    description: 'Google Cloud Platform API Key',
    severity: 'high',
  },
  {
    type: 'gcp_service_account',
    pattern: /"type"\s*:\s*"service_account"[\s\S]{0,500}"private_key"\s*:\s*"-----BEGIN/g,
    confidence: 0.99,
    description: 'GCP Service Account JSON',
    severity: 'critical',
  },
  {
    type: 'azure_storage_key',
    pattern: /\b[A-Za-z0-9+/]{86}==\b/g,
    confidence: 0.8,
    description: 'Azure Storage Account Key',
    severity: 'critical',
  },
  {
    type: 'azure_connection_string',
    pattern: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[^;]+;EndpointSuffix=[^;]+/g,
    confidence: 0.99,
    description: 'Azure Storage Connection String',
    severity: 'critical',
  },
  {
    type: 'digitalocean_token',
    pattern: /\bdop_v1_[A-Fa-f0-9]{64}\b/g,
    confidence: 0.99,
    description: 'DigitalOcean Personal Access Token',
    severity: 'high',
  },
  {
    type: 'vercel_token',
    pattern: /\b[A-Za-z0-9]{24}\b/g,
    confidence: 0.5,
    description: 'Potential Vercel Token',
    severity: 'high',
  },

  // ===========================================
  // Payment & Financial
  // ===========================================
  {
    type: 'stripe_api_key',
    pattern: /\b[sr]k_(live|test)_[A-Za-z0-9]{24,}\b/g,
    confidence: 0.99,
    description: 'Stripe API Key',
    severity: 'critical',
    rotationUrl: 'https://dashboard.stripe.com/apikeys',
  },
  {
    type: 'stripe_webhook_secret',
    pattern: /\bwhsec_[A-Za-z0-9]{32,}\b/g,
    confidence: 0.99,
    description: 'Stripe Webhook Secret',
    severity: 'high',
  },
  {
    type: 'paypal_client_secret',
    pattern: /\bEO[A-Za-z0-9_-]{60,}\b/g,
    confidence: 0.85,
    description: 'PayPal Client Secret',
    severity: 'critical',
  },
  {
    type: 'square_access_token',
    pattern: /\bsq0[a-z]{3}-[A-Za-z0-9_-]{22,}\b/g,
    confidence: 0.95,
    description: 'Square Access Token',
    severity: 'critical',
  },

  // ===========================================
  // GitHub Tokens
  // ===========================================
  {
    type: 'github_token',
    pattern: /\bghp_[A-Za-z0-9]{36}\b/g,
    confidence: 0.99,
    description: 'GitHub Personal Access Token (Classic)',
    severity: 'critical',
    rotationUrl: 'https://github.com/settings/tokens',
  },
  {
    type: 'github_token',
    pattern: /\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/g,
    confidence: 0.99,
    description: 'GitHub Fine-Grained Personal Access Token',
    severity: 'critical',
    rotationUrl: 'https://github.com/settings/tokens',
  },
  {
    type: 'github_oauth',
    pattern: /\bgho_[A-Za-z0-9]{36}\b/g,
    confidence: 0.99,
    description: 'GitHub OAuth Access Token',
    severity: 'high',
  },
  {
    type: 'github_oauth',
    pattern: /\bghu_[A-Za-z0-9]{36}\b/g,
    confidence: 0.99,
    description: 'GitHub User-to-Server Token',
    severity: 'high',
  },
  {
    type: 'github_oauth',
    pattern: /\bghs_[A-Za-z0-9]{36}\b/g,
    confidence: 0.99,
    description: 'GitHub Server-to-Server Token',
    severity: 'high',
  },
  {
    type: 'gitlab_token',
    pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    confidence: 0.99,
    description: 'GitLab Personal Access Token',
    severity: 'high',
  },
  {
    type: 'npm_token',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/g,
    confidence: 0.99,
    description: 'NPM Access Token',
    severity: 'high',
    rotationUrl: 'https://www.npmjs.com/settings/~/tokens',
  },
  {
    type: 'pypi_token',
    pattern: /\bpypi-[A-Za-z0-9_-]{50,}\b/g,
    confidence: 0.99,
    description: 'PyPI API Token',
    severity: 'high',
  },

  // ===========================================
  // Database Connection Strings
  // ===========================================
  {
    type: 'postgres_connection_string',
    pattern: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/]+\/[^\s"']+/gi,
    confidence: 0.95,
    description: 'PostgreSQL Connection String',
    severity: 'critical',
  },
  {
    type: 'mysql_connection_string',
    pattern: /mysql:\/\/[^:]+:[^@]+@[^/]+\/[^\s"']+/gi,
    confidence: 0.95,
    description: 'MySQL Connection String',
    severity: 'critical',
  },
  {
    type: 'mongodb_connection_string',
    pattern: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s"']+/gi,
    confidence: 0.95,
    description: 'MongoDB Connection String',
    severity: 'critical',
  },
  {
    type: 'redis_url',
    pattern: /redis(?:s)?:\/\/(?:[^:]+:[^@]+@)?[^/]+(?:\/\d+)?/gi,
    confidence: 0.85,
    description: 'Redis Connection URL',
    severity: 'high',
  },

  // ===========================================
  // Messaging & Communication
  // ===========================================
  {
    type: 'slack_token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    confidence: 0.95,
    description: 'Slack Token',
    severity: 'high',
  },
  {
    type: 'slack_webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    confidence: 0.99,
    description: 'Slack Webhook URL',
    severity: 'medium',
  },
  {
    type: 'discord_token',
    pattern: /\b[MN][A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{38}\b/g,
    confidence: 0.95,
    description: 'Discord Bot Token',
    severity: 'high',
  },
  {
    type: 'discord_webhook',
    pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g,
    confidence: 0.99,
    description: 'Discord Webhook URL',
    severity: 'medium',
  },
  {
    type: 'telegram_bot_token',
    pattern: /\b\d{9,10}:[A-Za-z0-9_-]{35}\b/g,
    confidence: 0.9,
    description: 'Telegram Bot Token',
    severity: 'high',
  },
  {
    type: 'twilio_api_key',
    pattern: /\bSK[A-Za-z0-9]{32}\b/g,
    confidence: 0.95,
    description: 'Twilio API Key SID',
    severity: 'high',
  },
  {
    type: 'sendgrid_api_key',
    pattern: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    confidence: 0.99,
    description: 'SendGrid API Key',
    severity: 'high',
  },
  {
    type: 'mailgun_api_key',
    pattern: /\bkey-[A-Za-z0-9]{32}\b/g,
    confidence: 0.9,
    description: 'Mailgun API Key',
    severity: 'high',
  },

  // ===========================================
  // JWT & Auth Tokens
  // ===========================================
  {
    type: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\b/g,
    confidence: 0.95,
    description: 'JSON Web Token',
    severity: 'high',
  },
  {
    type: 'bearer_token',
    pattern: /Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gi,
    confidence: 0.9,
    description: 'Bearer Token (JWT)',
    severity: 'high',
  },
  {
    type: 'basic_auth',
    pattern: /Basic\s+[A-Za-z0-9+/]+=*/gi,
    confidence: 0.85,
    description: 'Basic Auth Header',
    severity: 'high',
  },

  // ===========================================
  // Private Keys & Certificates
  // ===========================================
  {
    type: 'private_key_rsa',
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/g,
    confidence: 0.99,
    description: 'RSA Private Key',
    severity: 'critical',
  },
  {
    type: 'private_key_ec',
    pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]+?-----END EC PRIVATE KEY-----/g,
    confidence: 0.99,
    description: 'EC Private Key',
    severity: 'critical',
  },
  {
    type: 'private_key_pem',
    pattern: /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g,
    confidence: 0.99,
    description: 'PEM Private Key',
    severity: 'critical',
  },
  {
    type: 'ssh_private_key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g,
    confidence: 0.99,
    description: 'SSH Private Key',
    severity: 'critical',
  },
  {
    type: 'pgp_private_key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]+?-----END PGP PRIVATE KEY BLOCK-----/g,
    confidence: 0.99,
    description: 'PGP Private Key',
    severity: 'critical',
  },

  // ===========================================
  // Generic Patterns
  // ===========================================
  {
    type: 'generic_api_key',
    pattern: /\b(?:api[_-]?key|apikey|api[_-]?token|access[_-]?token)['":\s]*[=:]\s*['"]?([A-Za-z0-9_-]{20,})['"]?/gi,
    confidence: 0.75,
    description: 'Generic API Key Pattern',
    severity: 'high',
  },
  {
    type: 'generic_secret',
    pattern: /\b(?:secret|password|passwd|pwd)['":\s]*[=:]\s*['"]?([^\s'"]{8,})['"]?/gi,
    confidence: 0.7,
    description: 'Generic Secret Pattern',
    severity: 'high',
  },
  {
    type: 'password_in_url',
    pattern: /[a-z]+:\/\/[^:]+:([^@]+)@[^\s]+/gi,
    confidence: 0.9,
    description: 'Password in URL',
    severity: 'critical',
  },
];

// ============================================
// Helper Functions
// ============================================

/**
 * Get patterns by severity
 */
export function getPatternsBySeverity(
  severity: 'critical' | 'high' | 'medium' | 'low'
): SecretPatternDefinition[] {
  return SECRET_PATTERNS.filter((p) => p.severity === severity);
}

/**
 * Get patterns by type
 */
export function getPatternsByType(type: SecretType): SecretPatternDefinition[] {
  return SECRET_PATTERNS.filter((p) => p.type === type);
}

/**
 * Get all unique secret types
 */
export function getAllSecretTypes(): SecretType[] {
  return [...new Set(SECRET_PATTERNS.map((p) => p.type))];
}

/**
 * Get critical patterns only (for fast scanning)
 */
export function getCriticalPatterns(): SecretPatternDefinition[] {
  return SECRET_PATTERNS.filter(
    (p) => p.severity === 'critical' && p.confidence >= 0.9
  );
}

/**
 * Get high-confidence patterns
 */
export function getHighConfidencePatterns(minConfidence = 0.9): SecretPatternDefinition[] {
  return SECRET_PATTERNS.filter((p) => p.confidence >= minConfidence);
}
