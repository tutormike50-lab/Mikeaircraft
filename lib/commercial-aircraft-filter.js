function clean(value) {
  return String(value || "").trim().toUpperCase();
}

const NON_COMMERCIAL_OPERATOR_PREFIXES = new Set([
  "EAT"
]);

// Known airline ICAO callsign prefixes already recognised by MikeAircraft.
// These are only used as a fallback when aircraft type metadata is temporarily
// unavailable from internet enrichment. If a type is present, the normal
// commercial-aircraft type rules below remain authoritative.
const COMMERCIAL_OPERATOR_PREFIXES = new Set([
  "BAW","AFR","KLM","DLH","SWR","AUA","BEL","SAS","FIN","IBE","TAP","ITY",
  "EZY","EJU","RYR","WZZ","TVS","CSA","LOT","THY","UAE","QTR","ETD",
  "AAL","UAL","DAL","ACA","SIA","CPA","ANA","JAL","KAL","QFA","VIR","EIN",
  "ICE","NAX","EXS","TOM","TUI","VLG","TRA","AEE","ROT","BTI","PGT","MSR",
  "ETH","RAM","ISR","ELY"
]);

const COMMERCIAL_TYPE_PATTERNS = [
  // Airbus passenger and freighter families
  /^A(30[B6]|310|31[89]|32[0-1]|19N|20N|21N|33[2-9]|34[2-6]|35[9K]|388|3ST)$/,
  // Airbus A220
  /^BCS[13]$/,
  // Boeing passenger and freighter families
  /^B(70[13]|712|72[12]|73[1-9]|3[789X]M|74[1-8]|75[2-3]|76[2-4]|77[23LW]|78[89X])$/,
  // Embraer commercial regional aircraft
  /^E(120|13[05]|140|145|17[05]|19[05]|29[05])$/,
  // Bombardier commercial regional aircraft
  /^CRJ[1279X]$/,
  // ATR and De Havilland commercial turboprops
  /^AT(43|45|46|72|73|75|76)$/,
  /^DH8[A-D]$/,
  // Fokker, BAe/Avro and Saab regional airliners
  /^F(70|100)$/,
  /^(B46[123]|RJ(70|85|1H)|SF34|SB20)$/,
  // Douglas and McDonnell Douglas airliners
  /^(DC(8[5-7]|9[1-5]|10)|MD(11|8[0-9]|90))$/,
  // Other recognised passenger/cargo transports
  /^(D328|J328|SU95|C919|AJ27|MC21|L101|L188)$/,
  /^(IL(62|76|86|96)|T(134|154|204|214)|AN(12|22|24|26|72|74|124|225))$/
];

function isCommercialTransport(aircraft) {
  if (!aircraft) return false;

  const callsignPrefix = clean(aircraft.callsign || aircraft.flight || aircraft.call).slice(0, 3);
  if (NON_COMMERCIAL_OPERATOR_PREFIXES.has(callsignPrefix)) return false;

  const type = clean(
    aircraft.type ||
    aircraft.typeCode ||
    aircraft.aircraft?.typeCode ||
    aircraft.t
  );

  if (!type) return COMMERCIAL_OPERATOR_PREFIXES.has(callsignPrefix);
  return COMMERCIAL_TYPE_PATTERNS.some(pattern => pattern.test(type));
}

module.exports = {
  isCommercialTransport
};
