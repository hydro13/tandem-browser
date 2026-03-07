import { describe, expect, it } from 'vitest';
import { NativeMessagingSetup } from '../native-messaging';

describe('NativeMessagingSetup host access', () => {
  it('accepts known runtime IDs for hosts that publish the Chrome Web Store ID', () => {
    const setup = new NativeMessagingSetup();
    (setup as unknown as {
      hosts: Array<{
        name: string;
        description: string;
        binaryPath: string;
        binaryExists: boolean;
        allowedExtensions: string[];
        manifestPath: string;
      }>;
    }).hosts = [{
      name: 'com.1password.1password',
      description: '1Password BrowserSupport',
      binaryPath: '/Applications/1Password.app/Contents/MacOS/1Password-BrowserSupport',
      binaryExists: true,
      allowedExtensions: ['aeblfdkhhhdcdjpifhhbdiojplfjncoa'],
      manifestPath: '/tmp/com.1password.1password.json',
    }];

    const decision = setup.evaluateHostAccess('com.1password.1password', ['chdppelbdlmkldaobdpeaemleeajiodj']);

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain('explicitly allows');
  });
});
