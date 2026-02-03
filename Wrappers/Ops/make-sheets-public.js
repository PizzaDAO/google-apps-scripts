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
    '1HNnM5aHBRzE2Cv1_y86LgDQJ72h10WT1Vl5JDs16fr0',
    '1CkExNoXmT1AHrHZkjbKgbl2cD3lUSSFcx4Bn_MS1FYY',
    '1J1lFRmGWN7CLUUEpmIWa8OdieE7Xw6idXEjaA6DY0HQ',
    '1A7U4WopBmC77JURUkGscKRpacovvzJmxb0C9ebBap6w',
    '1atRDl5nCbFp0U2y_vVD6GR01JYIIwYhXYiYZ9bnKL3c',
    '1Fj1pmGMK7YOuVxreyzPfWvB8TkRP_Y5-HuoumP2TQsM',
    '1CFidMXdUmDPe8RWwuAbEv-WT5tRlGPYWhBsXGe2xEFE',
    '1ZjsTynZckUJfMfuXRwxPA110NCzJC-Ui6LsNVBZ1ZpQ',
    '1JtuC1npbAeq6DQQmJINsqmcpe8ELMfgMl86HANeqVSY',
    '1h3gfuZVZd60Iaqv6y2FzDRQBidspgaN1TDC5kdUgOYk',
    '1b--NWGBHcJtBGPpZDRcSwiITu9Z7rMeBzzpNhsXzW_o',
    '1t4HbO7922gURKHQOadAl-2CNycEncym4qhaW9LYFI1w',
    '1UfKywCxZokYJsghGOdANwLUzr9sj7t5gJbeU6PUK7a4',
    '1DIPj8qgE72nxQLT2PHDLmOMxcIUrAaIUUHWuKc8gfYE',
    '1HgBCv0DUxv-FacD2ks1UHaYu99YsKxPnv5uB4zf7Y74',
    '1pGL3mgLLP6iAJGrCeqStq6JWnrZGw410jfXdlM0yFck',
    '14VwwFlojrXr54sSqY-UDc3qfU8S9hatM8_BRt1FhWWQ',
    '18-rnoC1Dd09srYaw4_bGEKS9HXiPtoJyspoBsAk5GfE',
    '1XCfBuVOfL9BXPMyZl_G_unUzKvrGamWp9OfDt5ny-yk',
    '1CC6l6Wj8mQnrjuY4Ck-cStMxs4dodQTLmoUXsJ4Yl9A',
    '1GldYYPLoHx6p6EOcyfAsVwWAIzCi2fljJp3xjSqe7xw',
    '1r4HPH2wdrwetG2hE-XT1IgrMDG0YZ_D1aqWNWbVmL6U',
    '1M36_tR22M_70KO7_ibyr0h4FZQHzJR1AYG8ghYKT09U',
    '1s4DOoNK9PXj3drhtHKvq_Yo74WD_paA2TLWU_gaoFs4',
    '1NwPYUQ5aET1sTBB_H1Zpub5HHfsMNfBP9hizW0R0T2M',
    '1eiglTZRZMAprEYaW5m01vuDI1ebK12lzeF5NvWD8A7E',
    '1OCDt3uyruci4Ur3Z5wnMqMYBoJ-Q2hJebs36k4EddPU',
    '1jl1L-nKlUHo2nKP4iJx13PrbjOmcdA9W0_Fs7-u7CZ4',
    '19zb71W3lj2ohOTGw2T89Ws0T6TXzetFiwkRB6x1fDhk',
    '1OQfaBgtHiHko4ERKca5vE5hZ8VGivzTvM_4kznT_inY',
    '12bvoPHCibGqj5Vis-Z9Vu_jiBFBIzA2PP-bRHIX6uPc',
    '1zBENhXAdFhYXOWGjQybFPjQ_w0QId1RrNdU_xoxTyuA',
    '1dnMnCCL3mUFPtlhX8gTQUzNprxE2ClqC6uNtjwmi4d0',
    '1ggZcI74wnQUr6U-SV8GZCaOX8dGRSh_irtdp7dDruP8',
    '1aH7vtHSdoXSsNUg1oweCs7lTIxT1GyAgGb4KcuTx89c',
    '1uZ8ge_If2ylXFhMeUYzC8KSoju_6x7UzIOISRoBuzz4',
    '1jtdtcmxZSrnTIteVlCSiNl_F2jox8NoIqYKx9HetUxE',
    '1rgbLyjzDwcg7-lFyw3jNyOsswXn38MqVo5zJM1mOfsA',
    '1ra3n5qZIgyRvAiMSFxH-_UbYbrUynWDCCD-6Y1f3I2Q',
    '1YVh5d-4EjkcC4LsKr7hL7JIj8xakBUBjWEX6HvqanjI',
    '1EQsPPcDcaidy9GEznF1cRFi3Nt8LrRTwzPpJTb3Kc2E',
    '104aKblxmEcLuXiUn1jO4W9xGs9P2Fun0qlSs-q4IjBE',
    '11I8qwULji8u2St5JZkofkKiNqpEsSzXRavjtuMZuX1U',
    '1G0OiLyFdzNmKYSK4edkHWivRu9E9qTfuqQ-_002Ghr0',
    '1TIvKrBFKXQYo9opLQpjrNs0aBSk7YA6evSi7XoMBGIw',
    '1HHVAtSC38JitHSftA18Y5q68tSKw0GBoH0gtfjexqiI',
    '1Nau7-WHaFYVlU_4X9cjXiigV6Ecpd2o4uDyRyte_kvE',
    '1ERpekkFaCPxdAzP9FwuYilVpk4kSV5nHR40XBqJkDBc',
    '1P3ny2Ztb6Crm69GrdGIR8LGYPGL-uilSmC2sjgPOhxk'
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
