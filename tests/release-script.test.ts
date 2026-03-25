import { describe, expect, it } from 'vitest';

import {
  inferDistTag,
  isValidSemver,
  parseNpmTokenFromEnvFile,
  parseReleaseArgs,
} from '../scripts/release.ts';

describe('release script helpers', () => {
  describe('isValidSemver', () => {
    it('accepts stable and prerelease versions', () => {
      expect(isValidSemver('1.2.3')).toBe(true);
      expect(isValidSemver('0.1.0-alpha.15')).toBe(true);
      expect(isValidSemver('1.0.0-rc.1+build.5')).toBe(true);
    });

    it('rejects invalid versions', () => {
      expect(isValidSemver('v1.2.3')).toBe(false);
      expect(isValidSemver('1.2')).toBe(false);
      expect(isValidSemver('1.2.x')).toBe(false);
    });
  });

  describe('inferDistTag', () => {
    it('maps stable release to latest', () => {
      expect(inferDistTag('1.2.3')).toBe('latest');
    });

    it('maps prerelease to the first identifier', () => {
      expect(inferDistTag('0.1.0-alpha.2')).toBe('alpha');
      expect(inferDistTag('1.0.0-beta.1')).toBe('beta');
      expect(inferDistTag('1.0.0-rc.0')).toBe('rc');
    });

    it('falls back to next when prerelease identifier starts with a number', () => {
      expect(inferDistTag('1.0.0-1')).toBe('next');
    });
  });

  describe('parseNpmTokenFromEnvFile', () => {
    it('extracts token from plain, quoted, and export forms', () => {
      expect(parseNpmTokenFromEnvFile('NPM_TOKEN=npm_plain')).toBe('npm_plain');
      expect(parseNpmTokenFromEnvFile('export NPM_TOKEN="npm_double"')).toBe('npm_double');
      expect(parseNpmTokenFromEnvFile("NPM_TOKEN='npm_single'"))
        .toBe('npm_single');
    });

    it('ignores comments and unrelated keys', () => {
      const content = [
        '# comment',
        'FOO=bar',
        'NPM_TOKEN=npm_value # inline comment',
      ].join('\n');

      expect(parseNpmTokenFromEnvFile(content)).toBe('npm_value');
      expect(parseNpmTokenFromEnvFile('FOO=bar\nBAR=baz')).toBeUndefined();
    });
  });

  describe('parseReleaseArgs', () => {
    it('parses version, dry-run, and dist-tag', () => {
      expect(parseReleaseArgs(['0.1.0-alpha.16', '--dry-run', '--dist-tag', 'alpha'])).toEqual({
        versionArg: '0.1.0-alpha.16',
        dryRun: true,
        distTagOverride: 'alpha',
        help: false,
      });
    });

    it('supports --dist-tag=<value> syntax', () => {
      expect(parseReleaseArgs(['--dist-tag=next'])).toEqual({
        dryRun: false,
        distTagOverride: 'next',
        help: false,
      });
    });

    it('throws on unknown flags', () => {
      expect(() => parseReleaseArgs(['--unknown'])).toThrow('Unknown flag: --unknown');
    });
  });
});
