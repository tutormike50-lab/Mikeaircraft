// MikeAircraft Enrichment Service
// Version 0.2
// trigger deploy
// Airline/operator + friendly aircraft type names

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const callsign = String(req.query.callsign || "")
      .trim()
      .toUpperCase();

    const typeCode = String(req.query.type || "")
      .trim()
      .toUpperCase();

    if (!callsign && !typeCode) {
      return res.status(400).json({
        ok: false,
        error: "Missing callsign or type"
      });
    }

    // =====================================================
    // AIRLINES / OPERATORS
    // =====================================================

    const airlines = {
      BAW: { name: "British Airways", iata: "BA" },
      AFR: { name: "Air France", iata: "AF" },
      KLM: { name: "KLM", iata: "KL" },
      DLH: { name: "Lufthansa", iata: "LH" },
      SWR: { name: "Swiss International Air Lines", iata: "LX" },
      AUA: { name: "Austrian Airlines", iata: "OS" },
      BEL: { name: "Brussels Airlines", iata: "SN" },
      SAS: { name: "Scandinavian Airlines", iata: "SK" },
      FIN: { name: "Finnair", iata: "AY" },
      IBE: { name: "Iberia", iata: "IB" },
      TAP: { name: "TAP Air Portugal", iata: "TP" },
      ITY: { name: "ITA Airways", iata: "AZ" },

      EZY: { name: "easyJet", iata: "U2" },
      EJU: { name: "easyJet Europe", iata: "EC" },
      RYR: { name: "Ryanair", iata: "FR" },
      WZZ: { name: "Wizz Air", iata: "W6" },

      TVS: { name: "Smartwings", iata: "QS" },
      CSA: { name: "Czech Airlines", iata: "OK" },

      LOT: { name: "LOT Polish Airlines", iata: "LO" },
      THY: { name: "Turkish Airlines", iata: "TK" },
      UAE: { name: "Emirates", iata: "EK" },
      QTR: { name: "Qatar Airways", iata: "QR" },
      ETD: { name: "Etihad Airways", iata: "EY" },

      AAL: { name: "American Airlines", iata: "AA" },
      UAL: { name: "United Airlines", iata: "UA" },
      DAL: { name: "Delta Air Lines", iata: "DL" },
      ACA: { name: "Air Canada", iata: "AC" },

      SIA: { name: "Singapore Airlines", iata: "SQ" },
      CPA: { name: "Cathay Pacific", iata: "CX" },
      ANA: { name: "ANA", iata: "NH" },
      JAL: { name: "Japan Airlines", iata: "JL" },
      KAL: { name: "Korean Air", iata: "KE" },

      QFA: { name: "Qantas", iata: "QF" },
      VIR: { name: "Virgin Atlantic", iata: "VS" },
      EIN: { name: "Aer Lingus", iata: "EI" },
      ICE: { name: "Icelandair", iata: "FI" },
      NAX: { name: "Norwegian", iata: "DY" },
      EXS: { name: "Jet2", iata: "LS" },
      TOM: { name: "TUI Airways", iata: "BY" },
      TUI: { name: "TUI fly", iata: "X3" },
      VLG: { name: "Vueling", iata: "VY" },
      TRA: { name: "Transavia", iata: "HV" },
      AEE: { name: "Aegean Airlines", iata: "A3" },
      ROT: { name: "TAROM", iata: "RO" },
      BTI: { name: "airBaltic", iata: "BT" },
      PGT: { name: "Pegasus Airlines", iata: "PC" },
      MSR: { name: "EgyptAir", iata: "MS" },
      ETH: { name: "Ethiopian Airlines", iata: "ET" },
      RAM: { name: "Royal Air Maroc", iata: "AT" },
      ISR: { name: "Israir", iata: "6H" },
      ELY: { name: "EL AL", iata: "LY" }
    };

    // =====================================================
    // AIRCRAFT TYPE CODES
    // =====================================================

    const aircraftTypes = {
      A318: "Airbus A318",
      A319: "Airbus A319",
      A320: "Airbus A320",
      A321: "Airbus A321",

      A19N: "Airbus A319neo",
      A20N: "Airbus A320neo",
      A21N: "Airbus A321neo",

      A332: "Airbus A330-200",
      A333: "Airbus A330-300",
      A338: "Airbus A330-800neo",
      A339: "Airbus A330-900neo",

      A342: "Airbus A340-200",
      A343: "Airbus A340-300",
      A345: "Airbus A340-500",
      A346: "Airbus A340-600",

      A359: "Airbus A350-900",
      A35K: "Airbus A350-1000",

      A388: "Airbus A380-800",

      B712: "Boeing 717-200",

      B737: "Boeing 737",
      B738: "Boeing 737-800",
      B739: "Boeing 737-900",
      B38M: "Boeing 737 MAX 8",
      B39M: "Boeing 737 MAX 9",

      B744: "Boeing 747-400",
      B748: "Boeing 747-8",

      B752: "Boeing 757-200",
      B753: "Boeing 757-300",

      B762: "Boeing 767-200",
      B763: "Boeing 767-300",
      B764: "Boeing 767-400",

      B772: "Boeing 777-200",
      B773: "Boeing 777-300",
      B77L: "Boeing 777-200LR",
      B77W: "Boeing 777-300ER",

      B788: "Boeing 787-8 Dreamliner",
      B789: "Boeing 787-9 Dreamliner",
      B78X: "Boeing 787-10 Dreamliner",

      BCS1: "Airbus A220-100",
      BCS3: "Airbus A220-300",

      E170: "Embraer E170",
      E175: "Embraer E175",
      E190: "Embraer E190",
      E195: "Embraer E195",

      E290: "Embraer E190-E2",
      E295: "Embraer E195-E2",

      CRJ2: "Bombardier CRJ200",
      CRJ7: "Bombardier CRJ700",
      CRJ9: "Bombardier CRJ900",
      CRJX: "Bombardier CRJ1000",

      AT43: "ATR 42-300",
      AT45: "ATR 42-500",
      AT46: "ATR 42-600",
      AT72: "ATR 72-200",
      AT75: "ATR 72-500",
      AT76: "ATR 72-600",

      DH8A: "De Havilland Dash 8-100",
      DH8B: "De Havilland Dash 8-200",
      DH8C: "De Havilland Dash 8-300",
      DH8D: "De Havilland Dash 8-400",

      F70: "Fokker 70",
      F100: "Fokker 100",

      C56X: "Cessna Citation Excel/XLS",
      C680: "Cessna Citation Sovereign",
      C68A: "Cessna Citation Latitude",
      C700: "Cessna Citation Longitude",

      GLF4: "Gulfstream IV",
      GLF5: "Gulfstream V",
      GLF6: "Gulfstream G650",

      GLEX: "Bombardier Global Express",
      GL5T: "Bombardier Global 5000",
      GL7T: "Bombardier Global 7500",

      CL30: "Bombardier Challenger 300",
      CL35: "Bombardier Challenger 350",
      CL60: "Bombardier Challenger 600 Series",

      PC12: "Pilatus PC-12",
      PC24: "Pilatus PC-24"
    };

    // =====================================================
    // AIRLINE LOOKUP
    // =====================================================

    let operator = null;
    let flight = null;

    if (callsign) {
      const prefix =
        callsign.slice(0, 3);

      const airline =
        airlines[prefix] || null;

      const operationalNumber =
        callsign.length > 3
          ? callsign.slice(3)
          : null;

      let display =
        callsign;

      if (
        airline &&
        operationalNumber
      ) {
        display =
          `${airline.iata}${operationalNumber}`;
      }

      operator =
        airline
          ? {
              identified: true,
              icao: prefix,
              iata: airline.iata,
              name: airline.name
            }
          : {
              identified: false,
              icao: prefix,
              iata: null,
              name: null
            };

      flight = {
        operationalNumber,
        display
      };
    }

    // =====================================================
    // AIRCRAFT TYPE LOOKUP
    // =====================================================

    let aircraft = null;

    if (typeCode) {
      const friendlyName =
        aircraftTypes[typeCode] || null;

      aircraft = {
        code:
          typeCode,

        identified:
          Boolean(friendlyName),

        name:
          friendlyName ||
          typeCode
      };
    }

    return res.status(200).json({
      ok: true,

      service:
        "MikeAircraft Enrichment",

      version:
        "0.2",

      callsign:
        callsign || null,

      operator,

      flight,

      aircraft
    });
  }
  catch (error) {
    console.error(
      "MikeAircraft enrichment error:",
      error
    );

    return res.status(500).json({
      ok: false,

      service:
        "MikeAircraft Enrichment",

      version:
        "0.2",

      error:
        error.message
    });
  }
};
