/**
 * Make multiple spreadsheets public (Viewer access)
 *
 * Usage:
 * 1. Paste this into any crew spreadsheet's Apps Script editor
 * 2. Run makeAllSheetsPublic()
 * 3. Check the execution log for results
 */

function makeAllSheetsPublic() {
  const spreadsheetIds = [
    '1ZAoD5gI-ZnhBnxBvoRdodawvUyRUP_tB5r3e8rJ2a0A',
    '1HQg0jLwZQQkVeagVJiqfAgIxfl_fIfpUhOsRaTHPSOk',
    '1YIarKLtlMpXMa8fFQT8GzBKPKHgkiIisdp8PFZns0Ig',
    '1hWoQTkRlyNlI__bYPDyzMRYhPgNyBPK_nZcLD2N-I2c',
    '1b8ilCL-_yJm3XkLSue0mHJUvA-VbXzqauMOexR5NqwQ',
    '1ACjVzyRxjJ0PS7FVDwzjcZK8Z29uy3t3a2aaAqKZGaQ',
    '1hGRFBUsmHk69d3Mjh_0lLpIlxpsODc4siK7XbzweikY',
    '1oS9RbFoX_86P-qZc6F7oBEUDuRR-cDJJkdQwc6zbujc',
    '1B_i7nnC6JbPs9I1teFGUYPVx2oHnYsz1yYPQDuFAZcc',
    '155J9prQZf_f5gyb3j5IuduPOcqUKDjOpPdlMWJl0eA8',
    '1f5P4kPytmwYNFqDtMrLPA-FBwlHUoXR1sRSaLLps7U8',
    '12poC8mCFsVs-3qMz1uWE6xmRCye-DicPfo3dOg9uDP8',
    '1LXr9nspQi81G3vdPzHOESqTjJxoKrpfIO5nsis8Znfs',
    '1_53PMg4m4-VeyLVu3cv_N6EitcgJjH_Ubod9bNzKh3E',
    '1BJqBfXRoYs1tUBSCpvaho1gW8DkxgMJtKEg1kZri64M',
    '1irDIg6eUs2dJmxwCvn5ye6bnZwYpkWfKiv-HmydSC5I',
    '1ygFpBNJTSvKxT3I9MyvCss5PUxA5y2wszUrNLkTn6U4',
    '1ysl9pqFgdiNDd58mQXMcCGTXrhDeEIZ6BwWDJjfbHp8',
    '1UW7NZwa7e-zT1aQLZNyroXzS2cVoR5lXpPZnEoyiLLg',
    '1hx8jnk_TP88r3Bfm994yG0kdSX1vImGrrUmsIPs1bsQ',
    '1w9Z8cLgY2H8Jkw6FxuxBEzErrDC0Kb1XE1CFC9gLkxY',
    '1yQjF_fKDjEVbPC-lWkQR4HX4DkYShERBu1dBkHGibNg',
    '1ev2QSbqlISchDX7v5cnFdskFxc5iDL7A9NuDyIbSm88',
    '1kFRXEfVU82ugQOJtefIPh1mndQjyrN2Smvp0M7cyz30',
    '1OgN9VevZSWYJley5j-mgca_nownzqkydF8ZJI6DBWwU',
    '1Hbmqwu4KnTLGprTzqP5-06hOXgWHpSZr0UWvBB24Nn8',
    '1qeBZ4R_ninPPWcPsUKuV51bb3hjNbA-IRFGMo6mpAiY',
    '15dKYwYf2szLFuTQ1goJlO2KqDYeiTxrt_Cy-NvabTtQ',
    '1HGBpIvCdczCY6ncy2cguXxal2aKd1fcGaO5Yyn0xXy0',
    '14OC2etAxcXX2QsdX6PRjXYyevAxa-I5TiSdh4GKPtC8',
    '1VNGBfQ5WaydzX1W77ESYlGEYeftLQc378MDTTTxg37I',
    '1WH4YG4GnkIqUXtVEndjw4__kZPUlw5QaOK4ftIQXqso',
    '1KXngIeMrjfXRiIVLYGaXZsSXx69ZZlIOIS0s8xBLYW8',
    '1JKk2oNVWSqlgi8B-PECKiMQGaw_VLEhvL-K5H_6EemM',
    '1vkfeQdWLHRn2wL_2vrz_TzXDGaYcNpBpx193ERBWCHE',
    '1IwO7pXoxTjKki8Oy0hfyq4lqYNSKMIFUkqNXACqW49w',
    '1ZQ5dIZoipbr0xvMpfEqhSVT-p83V_uE1FwuiW8girl0',
    '1difafC-9OSDa90aH3cegIuHAErA2P4xvgQ-lGqk4f8g',
    '1RJ_NerzYvWbNZrTVFnjIA6QIjkVsYqPP2hcingpCgqM',
    '1vaTcbu201A152lOKtvmufcdjvqbj19CtL2lThDAK4nE',
    '1J4oY4YpgdR91jhjrF8447vrFrCD9Q84SnvCn5VDULQE',
    '1oV6Vl4vh1_yntm3AGjMXHURKAzVOgeVLvoi7ZTGZCnE',
    '1mytlIZ08pl11z7-kXPPeuNTHKdZ_qdVThfErAab-czc',
    '1aQ_as6naDozibkdk3PxkbLI9jzyqNfwXmP-PAPzpQiM',
    '1wheedWviA62tABuhDt1tgDAu8SktA3DwaRxf21HPArE',
    '1qdVILxtXbXCry7-MUWC3CiPpV2lpaL-EepXtPDbStXk',
    '1bJRXotO_Ya9PJnu3o2bg9AyPxFk7Iayoe2McTROsC7k',
    '16TQE6b0AgIlvzrNHJxfkl64dvTaeeK41LEhZZFAvArA',
    '1dAXmG-gpPnBGX9P1o8JjhhKSaTdxwwYREGNJNuxFOlo',
    '1u-w9r5Ra3zzoZHE3ytJuh1E8k_DNOZEtq_Pgv1TLB_k',
    '1EpNUPHz1fXlN2kYwWgFelW79ZFxQ4ofiEW2LqLagA0w',
    '1M3K6PP1BKr2fQ1TSKBhwKFMY-caxaaTm3EVdi72Gh9g',
    '1UOQw9KvFo2jqn8x-q24tYq7zcNvDWWPHszMvhrvmIlM'
  ];

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  console.log('Starting to make ' + spreadsheetIds.length + ' sheets public...\n');

  for (const id of spreadsheetIds) {
    try {
      const file = DriveApp.getFileById(id);
      file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
      console.log('✅ ' + id);
      successCount++;
    } catch (err) {
      console.log('❌ ' + id + ' - ' + err.message);
      errors.push({id, error: err.message});
      errorCount++;
    }
  }

  console.log('\n========================================');
  console.log('📊 Results: ' + successCount + ' succeeded, ' + errorCount + ' failed');
  console.log('========================================');

  if (errorCount > 0) {
    console.log('\nFailed IDs:');
    errors.forEach(e => console.log('  - ' + e.id + ': ' + e.error));
  }
}
