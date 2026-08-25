function isVerifiedDldRecord(record) {
  return Boolean(record) &&
    record.dataSource === 'dld-real' &&
    record.scrapedFrom === 'Dubai Land Department' &&
    record.verifiedBy === 'Government Record' &&
    record.appraiserValuation === undefined &&
    record.aqarVsAppraiser === undefined;
}

function findUnverifiedRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.filter(record => !isVerifiedDldRecord(record));
}

module.exports = { isVerifiedDldRecord, findUnverifiedRecords };
