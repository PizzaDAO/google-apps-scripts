/**
 * MARKDOWN LINK CONVERTER FOR DISCORD
 *
 * Converts markdown links [text](url) to plain URLs for Discord compatibility.
 * Discord webhooks don't support markdown link syntax, so we extract just the URLs.
 */

/**
 * Converts markdown links [text](url) to plain URLs
 *
 * @param {string} message - The message text potentially containing markdown links
 * @return {string} The message with markdown links converted to plain URLs
 */
function convertMarkdownLinksToUrls(message) {
  if (!message) return message;

  // Regex pattern: [anything](url)
  // Captures the URL in group 2
  const markdownLinkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;

  // Replace [text](url) with just url
  return String(message).replace(markdownLinkPattern, '$2');
}

/**
 * Test function to verify the markdown link converter works correctly
 * Run this in the Apps Script editor to verify
 */
function testConvertMarkdownLinksToUrls() {
  console.log('Testing convertMarkdownLinksToUrls()...\n');

  const testCases = [
    {
      name: 'Single markdown link',
      input: 'Check out [this guide](https://example.com)',
      expected: 'Check out https://example.com'
    },
    {
      name: 'Multiple markdown links',
      input: '[guide](https://example.com) and [join](https://other.com)',
      expected: 'https://example.com and https://other.com'
    },
    {
      name: 'Message with no links',
      input: 'Just a plain message',
      expected: 'Just a plain message'
    },
    {
      name: 'Empty string',
      input: '',
      expected: ''
    },
    {
      name: 'Complex message with mixed content',
      input: '🎉 Community Call Sunday, Jan 18 on Pizza Hacking Radio! 🥳\n10am PDT / 1pm EDT / 7pm CDT\n\nSpecials:\n[ETHDenver Sponsorships](https://ethereum.org)\n[Ops Crew Long Term + 2026 Goals](https://docs.google.com/)\n[Landing Page](https://pizzadao.xyz/landing)\n[Join Now](https://pizzadao.xyz/join)',
      expected: '🎉 Community Call Sunday, Jan 18 on Pizza Hacking Radio! 🥳\n10am PDT / 1pm EDT / 7pm CDT\n\nSpecials:\nhttps://ethereum.org\nhttps://docs.google.com/\nhttps://pizzadao.xyz/landing\nhttps://pizzadao.xyz/join'
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = convertMarkdownLinksToUrls(test.input);
    const success = result === test.expected;

    if (success) {
      console.log('✅ ' + test.name);
      passed++;
    } else {
      console.log('❌ ' + test.name);
      console.log('   Input:    ' + test.input);
      console.log('   Expected: ' + test.expected);
      console.log('   Got:      ' + result);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log('📊 Test Results: ' + passed + ' passed, ' + failed + ' failed');
  console.log('========================================');
}
