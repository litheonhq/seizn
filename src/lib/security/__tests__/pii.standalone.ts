/**
 * Tests for PII detection, masking, and audit utilities
 *
 * Run with: npx tsx src/lib/security/__tests__/pii.test.ts
 */

import {
  // Patterns
  luhnCheck,
  validateSSN,
  validateRRN,
  getAllPIITypes,

  // Detection
  detectPII,
  hasPII,
  detectPIIByType,
  countPIIByType,
  summarizePII,

  // Masking
  maskPII,
  maskValue,
  createMaskStrategy,

  // Convenience
  isSafe,
  redact,
  validatePII,
} from '../index';

// =============================================================================
// Simple Test Runner
// =============================================================================

interface TestResult {
  passed: number;
  failed: number;
  errors: string[];
}

const results: TestResult = {
  passed: 0,
  failed: 0,
  errors: [],
};

function assert(condition: boolean, message: string): void {
  if (condition) {
    results.passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    results.failed++;
    results.errors.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual === expected) {
    results.passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    results.failed++;
    results.errors.push(`${message}: expected ${expected}, got ${actual}`);
    console.log(`  [FAIL] ${message}: expected ${expected}, got ${actual}`);
  }
}

function assertContains(str: string, substr: string, message: string): void {
  if (str.includes(substr)) {
    results.passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    results.failed++;
    results.errors.push(`${message}: "${str}" should contain "${substr}"`);
    console.log(`  [FAIL] ${message}: "${str}" should contain "${substr}"`);
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

function it(name: string, fn: () => void): void {
  console.log(`  ${name}`);
  try {
    fn();
  } catch (error) {
    results.failed++;
    const message = error instanceof Error ? error.message : String(error);
    results.errors.push(`${name}: ${message}`);
    console.log(`  [ERROR] ${message}`);
  }
}

// =============================================================================
// Pattern Validation Tests
// =============================================================================

describe('PII Patterns - Validators', () => {
  describe('luhnCheck', () => {
    it('should validate correct credit card numbers', () => {
      assert(luhnCheck('4111111111111111'), 'Visa card should pass');
      assert(luhnCheck('5500000000000004'), 'Mastercard should pass');
    });

    it('should reject invalid credit card numbers', () => {
      assert(!luhnCheck('4111111111111112'), 'Invalid Visa should fail');
      assert(!luhnCheck('1234567890123456'), 'Random digits should fail');
    });

    it('should handle edge cases', () => {
      assert(!luhnCheck(''), 'Empty string should fail');
      assert(!luhnCheck('123'), 'Too short should fail');
    });
  });

  describe('validateSSN', () => {
    it('should validate valid SSN formats', () => {
      assert(validateSSN('123-45-6789'), 'Standard format should pass');
      assert(validateSSN('123456789'), 'No separators should pass');
    });

    it('should reject invalid SSNs', () => {
      assert(!validateSSN('000-12-3456'), 'Starting with 000 should fail');
      assert(!validateSSN('666-12-3456'), 'Starting with 666 should fail');
      assert(!validateSSN('111-11-1111'), 'All same digit should fail');
    });
  });

  describe('validateRRN', () => {
    it('should reject invalid RRN formats', () => {
      assert(!validateRRN('123456-1234567'), 'Random digits should fail');
      assert(!validateRRN('12345'), 'Too short should fail');
    });
  });
});

// =============================================================================
// Detection Tests
// =============================================================================

describe('PII Detection', () => {
  describe('detectPII', () => {
    it('should detect email addresses', () => {
      const result = detectPII('Contact: john.doe@example.com');
      assert(result.found, 'Should find PII');
      assert(result.types.includes('email'), 'Should include email type');
      assertEqual(result.matches[0].value, 'john.doe@example.com', 'Should extract email value');
    });

    it('should detect phone numbers', () => {
      const result = detectPII('Call me at 555-123-4567');
      assert(result.found, 'Should find PII');
      assert(result.types.includes('phone'), 'Should include phone type');
    });

    it('should detect Korean phone numbers', () => {
      const result = detectPII('전화번호: 010-1234-5678');
      assert(result.found, 'Should find PII');
      assert(result.types.includes('phone_kr'), 'Should include phone_kr type');
    });

    it('should detect credit card numbers', () => {
      const result = detectPII('Card: 4111-1111-1111-1111');
      assert(result.found, 'Should find PII');
      assert(result.types.includes('credit_card'), 'Should include credit_card type');
    });

    it('should detect API keys', () => {
      const result = detectPII('API Key: sk-abcdefghijklmnopqrstuvwxyz12345678');
      assert(result.found, 'Should find PII');
      assert(result.types.includes('api_key_openai'), 'Should include api_key_openai type');
    });

    it('should detect Seizn API keys', () => {
      const result = detectPII('Seizn Key: szn_abcdefghijklmnopqrstuvwxyz');
      assert(result.found, 'Should find PII');
      assert(result.types.includes('api_key_seizn'), 'Should include api_key_seizn type');
    });

    it('should detect multiple PII types in one text', () => {
      const result = detectPII('Email: test@test.com, Phone: 555-123-4567');
      assert(result.found, 'Should find PII');
      assertEqual(result.count, 2, 'Should find 2 matches');
      assert(result.types.includes('email'), 'Should include email');
      assert(result.types.includes('phone'), 'Should include phone');
    });

    it('should respect minConfidence option', () => {
      const result = detectPII('test@test.com', { minConfidence: 0.99 });
      assert(!result.found, 'Should not find PII with high threshold');
    });

    it('should respect includeTypes option', () => {
      const result = detectPII('test@test.com 555-123-4567', {
        includeTypes: ['email'],
      });
      assert(result.types.includes('email'), 'Should include email');
      assert(!result.types.includes('phone'), 'Should not include phone');
    });

    it('should respect excludeTypes option', () => {
      const result = detectPII('test@test.com', {
        excludeTypes: ['email'],
      });
      assert(!result.found, 'Should not find PII when email is excluded');
    });
  });

  describe('hasPII', () => {
    it('should return true when PII is present', () => {
      assert(hasPII('Email: test@example.com'), 'Should detect email');
      assert(hasPII('Phone: 555-123-4567'), 'Should detect phone');
    });

    it('should return false when no PII is present', () => {
      assert(!hasPII('Hello, world!'), 'Should not detect PII in greeting');
      assert(!hasPII('This is a test'), 'Should not detect PII in plain text');
    });
  });

  describe('detectPIIByType', () => {
    it('should detect only specified type', () => {
      const text = 'Email: test@test.com, Phone: 555-123-4567';
      const emails = detectPIIByType(text, 'email');
      assertEqual(emails.length, 1, 'Should find 1 email');
      assertEqual(emails[0].type, 'email', 'Should be email type');
    });
  });

  describe('countPIIByType', () => {
    it('should count PII by type', () => {
      const text = 'a@b.com, c@d.com, 555-123-4567';
      const counts = countPIIByType(text);
      assertEqual(counts.email, 2, 'Should find 2 emails');
      assertEqual(counts.phone, 1, 'Should find 1 phone');
    });
  });

  describe('summarizePII', () => {
    it('should provide human-readable summary', () => {
      const result = detectPII('test@test.com');
      const summary = summarizePII(result);
      assertContains(summary, 'email', 'Should mention email');
    });

    it('should return no PII message when empty', () => {
      const result = detectPII('Hello world');
      const summary = summarizePII(result);
      assertEqual(summary, 'No PII detected', 'Should return no PII message');
    });
  });
});

// =============================================================================
// Masking Tests
// =============================================================================

describe('PII Masking', () => {
  describe('maskPII', () => {
    it('should mask email addresses', () => {
      const result = maskPII('Email: john@example.com');
      assert(result.modified, 'Should be modified');
      assertContains(result.masked, 'j***', 'Should mask email local part');
      assertContains(result.masked, '.com', 'Should keep TLD');
    });

    it('should mask phone numbers', () => {
      const result = maskPII('Phone: 555-123-4567');
      assert(result.modified, 'Should be modified');
      assertContains(result.masked, '4567', 'Should keep last 4 digits');
      assertContains(result.masked, '***', 'Should have mask chars');
    });

    it('should mask credit cards', () => {
      const result = maskPII('Card: 4111-1111-1111-1111');
      assert(result.modified, 'Should be modified');
      assertContains(result.masked, '1111', 'Should keep last 4 digits');
      assertContains(result.masked, '****', 'Should have mask chars');
    });

    it('should mask API keys', () => {
      const result = maskPII('Key: szn_abcdefghijklmnopqrstuvwxyz1234');
      assert(result.modified, 'Should be modified');
      assertContains(result.masked, 'szn_', 'Should keep prefix');
      assertContains(result.masked, '****', 'Should have mask chars');
    });

    it('should return unmodified text when no PII', () => {
      const result = maskPII('Hello, world!');
      assert(!result.modified, 'Should not be modified');
      assertEqual(result.masked, 'Hello, world!', 'Should be unchanged');
    });

    it('should track masked types and count', () => {
      const result = maskPII('Email: test@test.com');
      assertEqual(result.maskedCount, 1, 'Should count 1 masked item');
      assert(result.maskedTypes.includes('email'), 'Should include email type');
    });
  });

  describe('maskValue', () => {
    it('should mask email correctly', () => {
      const masked = maskValue('john.doe@example.com', 'email');
      assertEqual(masked, 'j***@e***.com', 'Should mask email properly');
    });

    it('should mask credit card correctly', () => {
      const masked = maskValue('4111-1111-1111-1111', 'credit_card');
      assertEqual(masked, '****-****-****-1111', 'Should mask card properly');
    });

    it('should mask SSN correctly', () => {
      const masked = maskValue('123-45-6789', 'ssn');
      assertEqual(masked, '***-**-6789', 'Should mask SSN properly');
    });

    it('should mask Korean RRN completely', () => {
      const masked = maskValue('920101-1234567', 'rrn');
      assertEqual(masked, '******-*******', 'Should fully mask RRN');
    });
  });

  describe('createMaskStrategy', () => {
    it('should create custom strategy', () => {
      const strategy = createMaskStrategy({
        showFirstN: 2,
        showLastN: 2,
        preserveLength: true,
      });
      assertEqual(strategy.showFirstN, 2, 'Should have correct showFirstN');
      assertEqual(strategy.showLastN, 2, 'Should have correct showLastN');
      assert(strategy.preserveLength, 'Should preserve length');
    });
  });
});

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('Convenience Functions', () => {
  describe('isSafe', () => {
    it('should return true for safe text', () => {
      assert(isSafe('Hello, world!'), 'Should be safe');
    });

    it('should return false for text with PII', () => {
      assert(!isSafe('Email: test@test.com'), 'Should not be safe');
    });
  });

  describe('redact', () => {
    it('should replace all PII with [REDACTED]', () => {
      const result = redact('Email: test@test.com');
      assertEqual(result, 'Email: [REDACTED]', 'Should redact email');
      assert(!result.includes('test@test.com'), 'Should not contain original');
    });

    it('should redact multiple PII instances', () => {
      const result = redact('test@a.com and test@b.com');
      assertEqual(result, '[REDACTED] and [REDACTED]', 'Should redact both');
    });
  });

  describe('validatePII', () => {
    it('should return valid for clean text', () => {
      const result = validatePII('Hello, world!');
      assert(result.valid, 'Should be valid');
      assertEqual(result.blockedTypes.length, 0, 'Should have no blocked types');
    });

    it('should return invalid for blocked types', () => {
      const result = validatePII('test@test.com');
      assert(!result.valid, 'Should be invalid');
      assert(result.blockedTypes.includes('email'), 'Should block email');
    });

    it('should allow specified types', () => {
      const result = validatePII('test@test.com', ['email']);
      assert(result.valid, 'Should be valid when email is allowed');
    });
  });

  describe('getAllPIITypes', () => {
    it('should return all PII types', () => {
      const types = getAllPIITypes();
      assert(types.includes('email'), 'Should include email');
      assert(types.includes('phone'), 'Should include phone');
      assert(types.includes('credit_card'), 'Should include credit_card');
      assert(types.includes('ssn'), 'Should include ssn');
      assert(types.includes('rrn'), 'Should include rrn');
      assert(types.length > 10, 'Should have many types');
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty string', () => {
    assert(!hasPII(''), 'Empty string should have no PII');
    assert(!detectPII('').found, 'Detection should find nothing');
    assert(!maskPII('').modified, 'Masking should not modify');
  });

  it('should handle very long strings', () => {
    const longText = 'a'.repeat(10000) + ' test@test.com ' + 'b'.repeat(10000);
    const result = detectPII(longText);
    assert(result.found, 'Should find PII in long text');
    assertEqual(result.matches[0].value, 'test@test.com', 'Should extract email');
  });

  it('should handle special characters', () => {
    const result = detectPII('Email: user+tag@sub.example.co.kr');
    assert(result.found, 'Should find email with special chars');
  });

  it('should handle unicode text', () => {
    const result = detectPII('이메일: test@test.com, 전화: 010-1234-5678');
    assert(result.found, 'Should find PII in unicode text');
    assert(result.types.includes('email'), 'Should include email');
    assert(result.types.includes('phone_kr'), 'Should include Korean phone');
  });
});

// =============================================================================
// Run Tests
// =============================================================================

console.log('\n========================================');
console.log('PII Security Module Tests');
console.log('========================================');

// Run all tests
console.log('\n----------------------------------------');
console.log('Test Results');
console.log('----------------------------------------');
console.log(`Passed: ${results.passed}`);
console.log(`Failed: ${results.failed}`);

if (results.errors.length > 0) {
  console.log('\nErrors:');
  results.errors.forEach((error) => console.log(`  - ${error}`));
}

console.log('\n========================================');
console.log(results.failed === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
console.log('========================================\n');

// process.exit removed for vitest compatibility
