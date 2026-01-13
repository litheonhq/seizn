/**
 * PII Scanner Tests
 *
 * These tests verify the PII detection and masking functionality.
 * Can be run with Node.js built-in test runner: node --test
 * Or adapted for Jest/Vitest by replacing assert with expect.
 */

import {
  scanForPII,
  maskPII,
  scanAndMask,
  quickPIICheck,
  luhnCheck,
  calculateEntropy,
  type PIIType,
} from '../scanner';

// =============================================================================
// Test Utilities
// =============================================================================

interface TestCase {
  name: string;
  input: string;
  expectedTypes: PIIType[];
  shouldDetect: boolean;
}

function runTests() {
  const results: { passed: number; failed: number; errors: string[] } = {
    passed: 0,
    failed: 0,
    errors: [],
  };

  function assert(condition: boolean, message: string) {
    if (condition) {
      results.passed++;
    } else {
      results.failed++;
      results.errors.push(message);
    }
  }

  function assertEqual<T>(actual: T, expected: T, message: string) {
    if (actual === expected) {
      results.passed++;
    } else {
      results.failed++;
      results.errors.push(`${message}: expected ${expected}, got ${actual}`);
    }
  }

  function assertIncludes<T>(array: T[], item: T, message: string) {
    if (array.includes(item)) {
      results.passed++;
    } else {
      results.failed++;
      results.errors.push(`${message}: ${item} not found in [${array.join(', ')}]`);
    }
  }

  // ===========================================================================
  // Email Detection Tests
  // ===========================================================================

  console.log('\n--- Email Detection Tests ---');

  const emailTestCases: TestCase[] = [
    {
      name: 'Simple email',
      input: 'Contact us at test@example.com for help',
      expectedTypes: ['email'],
      shouldDetect: true,
    },
    {
      name: 'Email with subdomain',
      input: 'Send to user@mail.company.co.uk',
      expectedTypes: ['email'],
      shouldDetect: true,
    },
    {
      name: 'Email with plus sign',
      input: 'My email is john.doe+test@gmail.com',
      expectedTypes: ['email'],
      shouldDetect: true,
    },
    {
      name: 'No email',
      input: 'This is just regular text without any emails',
      expectedTypes: [],
      shouldDetect: false,
    },
  ];

  for (const tc of emailTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'email', tc.name);
    }
  }

  // ===========================================================================
  // Phone Number Detection Tests
  // ===========================================================================

  console.log('\n--- Phone Number Detection Tests ---');

  const phoneTestCases: TestCase[] = [
    {
      name: 'US phone with dashes',
      input: 'Call me at 555-123-4567',
      expectedTypes: ['phone'],
      shouldDetect: true,
    },
    {
      name: 'US phone with parentheses',
      input: 'Phone: (555) 123-4567',
      expectedTypes: ['phone'],
      shouldDetect: true,
    },
    {
      name: 'US phone with country code',
      input: 'Contact: +1-555-123-4567',
      expectedTypes: ['phone'],
      shouldDetect: true,
    },
    {
      name: 'Korean mobile number',
      input: '연락처: 010-1234-5678',
      expectedTypes: ['phone'],
      shouldDetect: true,
    },
    {
      name: 'Korean landline',
      input: 'Office: 02-1234-5678',
      expectedTypes: ['phone'],
      shouldDetect: true,
    },
  ];

  for (const tc of phoneTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'phone', tc.name);
    }
  }

  // ===========================================================================
  // SSN Detection Tests
  // ===========================================================================

  console.log('\n--- SSN Detection Tests ---');

  const ssnTestCases: TestCase[] = [
    {
      name: 'Valid SSN format',
      input: 'SSN: 123-45-6789',
      expectedTypes: ['ssn'],
      shouldDetect: true,
    },
    {
      name: 'SSN without dashes',
      input: 'Social: 123456789',
      expectedTypes: ['ssn'],
      shouldDetect: true,
    },
    {
      name: 'Invalid SSN (all same digits)',
      input: 'Number: 111-11-1111',
      expectedTypes: [],
      shouldDetect: false, // Should fail validation
    },
    {
      name: 'Invalid SSN (starts with 000)',
      input: 'SSN: 000-12-3456',
      expectedTypes: [],
      shouldDetect: false,
    },
  ];

  for (const tc of ssnTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect && tc.expectedTypes.includes('ssn')) {
      assertIncludes(result.detectedTypes, 'ssn', tc.name);
    }
  }

  // ===========================================================================
  // Credit Card Detection Tests
  // ===========================================================================

  console.log('\n--- Credit Card Detection Tests ---');

  // Test Luhn algorithm
  assertEqual(luhnCheck('4532015112830366'), true, 'Valid Visa should pass Luhn');
  assertEqual(luhnCheck('4532015112830367'), false, 'Invalid card should fail Luhn');
  assertEqual(luhnCheck('5425233430109903'), true, 'Valid Mastercard should pass Luhn');

  const ccTestCases: TestCase[] = [
    {
      name: 'Valid Visa',
      input: 'Card: 4532015112830366',
      expectedTypes: ['credit_card'],
      shouldDetect: true,
    },
    {
      name: 'Card with spaces',
      input: 'Payment: 4532 0151 1283 0366',
      expectedTypes: ['credit_card'],
      shouldDetect: true,
    },
    {
      name: 'Invalid card number',
      input: 'Card: 1234567890123456',
      expectedTypes: [],
      shouldDetect: false, // Fails Luhn
    },
  ];

  for (const tc of ccTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
  }

  // ===========================================================================
  // API Key Detection Tests
  // ===========================================================================

  console.log('\n--- API Key Detection Tests ---');

  const apiKeyTestCases: TestCase[] = [
    {
      name: 'OpenAI API key',
      input: 'API key: sk-1234567890abcdefghijklmnopqrstuvwxyz',
      expectedTypes: ['api_key'],
      shouldDetect: true,
    },
    {
      name: 'Seizn API key',
      input: 'Use szn_abc123def456ghi789jkl012mno345 for access',
      expectedTypes: ['api_key'],
      shouldDetect: true,
    },
    {
      name: 'Stripe live key',
      input: 'STRIPE_KEY=sk_live_1234567890abcdefghijklmnopqrst',
      expectedTypes: ['api_key'],
      shouldDetect: true,
    },
    {
      name: 'Stripe test key',
      input: 'Testing with sk_test_1234567890abcdefghijklmnopqrst',
      expectedTypes: ['api_key'],
      shouldDetect: true,
    },
  ];

  for (const tc of apiKeyTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'api_key', tc.name);
    }
  }

  // ===========================================================================
  // AWS Key Detection Tests
  // ===========================================================================

  console.log('\n--- AWS Key Detection Tests ---');

  const awsKeyTestCases: TestCase[] = [
    {
      name: 'AWS Access Key ID',
      input: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
      expectedTypes: ['aws_key'],
      shouldDetect: true,
    },
  ];

  for (const tc of awsKeyTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'aws_key', tc.name);
    }
  }

  // ===========================================================================
  // GitHub Token Detection Tests
  // ===========================================================================

  console.log('\n--- GitHub Token Detection Tests ---');

  const githubTestCases: TestCase[] = [
    {
      name: 'GitHub PAT (classic)',
      input: 'Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz',
      expectedTypes: ['github_token'],
      shouldDetect: true,
    },
    {
      name: 'GitHub fine-grained PAT',
      input: 'GITHUB_TOKEN=github_pat_abc123def456ghi789jkl',
      expectedTypes: ['github_token'],
      shouldDetect: true,
    },
  ];

  for (const tc of githubTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'github_token', tc.name);
    }
  }

  // ===========================================================================
  // JWT Detection Tests
  // ===========================================================================

  console.log('\n--- JWT Detection Tests ---');

  const jwtTestCases: TestCase[] = [
    {
      name: 'Valid JWT format',
      input: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      expectedTypes: ['jwt'],
      shouldDetect: true,
    },
  ];

  for (const tc of jwtTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'jwt', tc.name);
    }
  }

  // ===========================================================================
  // Private Key Detection Tests
  // ===========================================================================

  console.log('\n--- Private Key Detection Tests ---');

  const privateKeyTest = `
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3X
-----END RSA PRIVATE KEY-----
`;

  const pkResult = scanForPII(privateKeyTest);
  assert(pkResult.hasPII === true, 'Should detect private key');
  assertIncludes(pkResult.detectedTypes, 'private_key', 'Private key detection');

  // ===========================================================================
  // Password Pattern Detection Tests
  // ===========================================================================

  console.log('\n--- Password Pattern Detection Tests ---');

  const passwordTestCases: TestCase[] = [
    {
      name: 'Password with colon',
      input: 'password: mysecretpass123',
      expectedTypes: ['password'],
      shouldDetect: true,
    },
    {
      name: 'Password with equals',
      input: 'DB_PASSWORD=verysecure!password',
      expectedTypes: ['password'],
      shouldDetect: true,
    },
    {
      name: 'Secret token',
      input: 'secret: abcd1234efgh5678',
      expectedTypes: ['password'],
      shouldDetect: true,
    },
  ];

  for (const tc of passwordTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'password', tc.name);
    }
  }

  // ===========================================================================
  // IP Address Detection Tests
  // ===========================================================================

  console.log('\n--- IP Address Detection Tests ---');

  const ipTestCases: TestCase[] = [
    {
      name: 'IPv4 address',
      input: 'Server IP: 192.168.1.100',
      expectedTypes: ['ip_address'],
      shouldDetect: true,
    },
    {
      name: 'Public IPv4',
      input: 'Connect to 8.8.8.8',
      expectedTypes: ['ip_address'],
      shouldDetect: true,
    },
  ];

  for (const tc of ipTestCases) {
    const result = scanForPII(tc.input);
    assert(
      result.hasPII === tc.shouldDetect,
      `${tc.name}: hasPII should be ${tc.shouldDetect}`
    );
    if (tc.shouldDetect) {
      assertIncludes(result.detectedTypes, 'ip_address', tc.name);
    }
  }

  // ===========================================================================
  // Masking Tests
  // ===========================================================================

  console.log('\n--- Masking Tests ---');

  const contentWithPII = 'Contact john@example.com or call 555-123-4567';
  const scanResult = scanForPII(contentWithPII);
  const masked = maskPII(contentWithPII, scanResult.details);

  assert(
    masked.includes('[MASKED_EMAIL]'),
    'Should mask email with placeholder'
  );
  assert(
    masked.includes('[MASKED_PHONE]'),
    'Should mask phone with placeholder'
  );
  assert(
    !masked.includes('john@example.com'),
    'Should not contain original email'
  );
  assert(
    !masked.includes('555-123-4567'),
    'Should not contain original phone'
  );

  // ===========================================================================
  // scanAndMask Tests
  // ===========================================================================

  console.log('\n--- scanAndMask Tests ---');

  const combinedResult = scanAndMask('API key is sk-abcdefghij1234567890abcdefghij');
  assert(combinedResult.hasPII === true, 'Should detect PII');
  assert(
    combinedResult.maskedContent !== undefined,
    'Should have masked content'
  );
  assert(
    combinedResult.maskedContent?.includes('[MASKED_API_KEY]') ?? false,
    'Should contain masked API key placeholder'
  );

  // ===========================================================================
  // quickPIICheck Tests
  // ===========================================================================

  console.log('\n--- quickPIICheck Tests ---');

  assertEqual(
    quickPIICheck('Contact test@example.com'),
    true,
    'Quick check should detect email'
  );
  assertEqual(
    quickPIICheck('sk-1234567890abcdefghij'),
    true,
    'Quick check should detect API key'
  );
  assertEqual(
    quickPIICheck('This is safe text'),
    false,
    'Quick check should not flag safe text'
  );

  // ===========================================================================
  // Entropy Calculation Tests
  // ===========================================================================

  console.log('\n--- Entropy Tests ---');

  const lowEntropyString = 'aaaaaaaaaa';
  const highEntropyString = 'aB3$xY9!mK2@qW8#';

  assert(
    calculateEntropy(lowEntropyString) < 1,
    'Low entropy string should have entropy < 1'
  );
  assert(
    calculateEntropy(highEntropyString) > 3,
    'High entropy string should have entropy > 3'
  );

  // ===========================================================================
  // Multiple PII Types Test
  // ===========================================================================

  console.log('\n--- Multiple PII Types Test ---');

  const multiPIIContent = `
    Contact: john.doe@company.com
    Phone: 555-123-4567
    SSN: 123-45-6789
    Card: 4532015112830366
    API: sk-abcdefghij1234567890abcdefghij
  `;

  const multiResult = scanForPII(multiPIIContent);
  assert(multiResult.hasPII === true, 'Should detect multiple PII types');
  assert(
    multiResult.detectedTypes.length >= 4,
    'Should detect at least 4 different types'
  );
  assertIncludes(multiResult.detectedTypes, 'email', 'Should detect email');
  assertIncludes(multiResult.detectedTypes, 'phone', 'Should detect phone');
  assertIncludes(multiResult.detectedTypes, 'api_key', 'Should detect API key');

  // ===========================================================================
  // Options Test
  // ===========================================================================

  console.log('\n--- Options Test ---');

  // Test with includeValues
  const withValues = scanForPII('test@example.com', { includeValues: true });
  assert(
    withValues.details[0]?.value !== undefined,
    'Should include value when option is set'
  );

  // Test with typesToScan filter
  const onlyEmail = scanForPII('test@example.com and 555-123-4567', {
    typesToScan: ['email'],
  });
  assertIncludes(onlyEmail.detectedTypes, 'email', 'Should detect email');
  assert(
    !onlyEmail.detectedTypes.includes('phone'),
    'Should not detect phone when filtered'
  );

  // Test with excludeTypes
  const excludeEmail = scanForPII('test@example.com and 555-123-4567', {
    excludeTypes: ['email'],
  });
  assert(
    !excludeEmail.detectedTypes.includes('email'),
    'Should not detect excluded email'
  );
  assertIncludes(excludeEmail.detectedTypes, 'phone', 'Should still detect phone');

  // ===========================================================================
  // Summary
  // ===========================================================================

  console.log('\n========================================');
  console.log('Test Results:');
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\nFailures:');
    results.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
  }

  console.log('========================================\n');

  return results;
}

// Run tests if this file is executed directly
// In Node.js: node --test or ts-node scanner.test.ts
// In Jest/Vitest: tests will be discovered automatically if wrapped in describe/it

// For direct execution
if (typeof require !== 'undefined' && require.main === module) {
  runTests();
}

// Export for test frameworks
export { runTests };

// =============================================================================
// Jest/Vitest Compatible Tests (uncomment when test framework is added)
// =============================================================================

/*
describe('PII Scanner', () => {
  describe('Email Detection', () => {
    it('should detect simple email', () => {
      const result = scanForPII('Contact us at test@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('email');
    });
  });

  describe('Masking', () => {
    it('should mask detected PII', () => {
      const content = 'Email: test@example.com';
      const result = scanAndMask(content);
      expect(result.maskedContent).toContain('[MASKED_EMAIL]');
      expect(result.maskedContent).not.toContain('test@example.com');
    });
  });

  // Add more test suites...
});
*/
