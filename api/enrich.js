// MikeAircraft Enrichment Service
// Version 0.1
// Stage: Airline / operator identification

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const callsign = String(req.query.callsign || "")
      .trim()
      .toUpperCase();

    if (!callsign) {
      return res.status(400).json({
        ok: false,
        error: "Missing callsign"
      });
    }

    // ICAO airline designators used by the aircraft callsign.
    // We can expand this table without changing the movement engine.
    const airlines = {
      BAW: {
        name: "British Airways",
        iata: "BA"
      },
      AFR: {
        name: "Air France",
        iata: "AF"
      },
      KLM: {
        name: "KLM",
        iata: "KL"
      },
      DLH: {
        name: "Lufthansa",
        iata: "LH"
      },
      SWR: {
        name: "SWISS",
        iata: "LX"
      },
      AUA: {
        name: "Austrian Airlines",
        iata: "OS"
      },
      BEL: {
        name: "Brussels Airlines",
        iata: "SN"
      },
      SAS: {
        name: "Scandinavian Airlines",
        iata: "SK"
      },
      FIN: {
        name: "Finnair",
        iata: "AY"
      },
      IBE: {
        name: "Iberia",
        iata: "IB"
      },
      TAP: {
        name: "TAP Air Portugal",
        iata: "TP"
      },
      ITY: {
        name: "ITA Airways",
        iata: "AZ"
      },

      EZY: {
        name: "easyJet",
        iata: "U2"
      },
      EJU: {
        name: "easyJet Europe",
        iata: "EC"
      },
      RYR: {
        name: "Ryanair",
        iata: "FR"
      },
      WZZ: {
        name: "Wizz Air",
        iata: "W6"
      },

      TVS: {
        name: "Smartwings",
        iata: "QS"
      },
      CSA: {
        name: "Czech Airlines",
        iata: "OK"
      },

      LOT: {
        name: "LOT Polish Airlines",
        iata: "LO"
      },
      THY: {
        name: "Turkish Airlines",
        iata: "TK"
      },
      UAE: {
        name: "Emirates",
        iata: "EK"
      },
      QTR: {
        name: "Qatar Airways",
        iata: "QR"
      },
      ETD: {
        name: "Etihad Airways",
        iata: "EY"
      },

      AAL: {
        name: "American Airlines",
        iata: "AA"
      },
      UAL: {
        name: "United Airlines",
        iata: "UA"
      },
      DAL: {
        name: "Delta Air Lines",
        iata: "DL"
      },

      ACA: {
        name: "Air Canada",
        iata: "AC"
      },

      SIA: {
        name: "Singapore Airlines",
        iata: "SQ"
      },
      CPA: {
        name: "Cathay Pacific",
        iata: "CX"
      },
      ANA: {
        name: "ANA",
        iata: "NH"
      },
      JAL: {
        name: "Japan Airlines",
        iata: "JL"
      },
      KAL: {
        name: "Korean Air",
        iata: "KE"
      },

      QFA: {
        name: "Qantas",
        iata: "QF"
      },

      VIR: {
        name: "Virgin Atlantic",
        iata: "VS"
      },

      EIN: {
        name: "Aer Lingus",
        iata: "EI"
      },

      ICE: {
        name: "Icelandair",
        iata: "FI"
      },

      NAX: {
        name: "Norwegian",
        iata: "DY"
      },

      EXS: {
        name: "Jet2",
        iata: "LS"
      },

      TOM: {
        name: "TUI Airways",
        iata: "BY"
      },

      TUI: {
        name: "TUI fly",
        iata: "X3"
      },

      VLG: {
        name: "Vueling",
        iata: "VY"
      },

      TRA: {
        name: "Transavia",
        iata: "HV"
      },

      AEE: {
        name: "Aegean Airlines",
        iata: "A3"
      },

      ROT: {
        name: "TAROM",
        iata: "RO"
      },

      BTI: {
        name: "airBaltic",
        iata: "BT"
      },

      PGT: {
        name: "Pegasus Airlines",
        iata: "PC"
      },

      MSR: {
        name: "EgyptAir",
        iata: "MS"
      },

      ETH: {
        name: "Ethiopian Airlines",
        iata: "ET"
      },

      RAM: {
        name: "Royal Air Maroc",
        iata: "AT"
      },

      ISR: {
        name: "Israir",
        iata: "6H"
      },

      ELY: {
        name: "EL AL",
        iata: "LY"
      }
    };

    // Normal airline callsigns begin with the three-character
    // ICAO operator designator.
    const prefix = callsign.slice(0, 3);

    const airline = airlines[prefix] || null;

    // Keep whatever follows the ICAO designator.
    // Example:
    // BAW123 -> 123
    // AFR1082 -> 1082
    // KLM53D -> 53D
    const operationalNumber =
      callsign.length > 3
        ? callsign.slice(3)
        : null;

    let displayFlight = callsign;

    if (airline && operationalNumber) {
      displayFlight =
        `${airline.iata}${operationalNumber}`;
    }

    return res.status(200).json({
      ok: true,

      service: "MikeAircraft Enrichment",
      version: "0.1",

      callsign,

      operator: airline
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
          },

      flight: {
        operationalNumber,
        display: displayFlight
      }
    });
  }
  catch (error) {
    console.error(
      "MikeAircraft enrichment error:",
      error
    );

    return res.status(500).json({
      ok: false,
      service: "MikeAircraft Enrichment",
      version: "0.1",
      error: error.message
    });
  }
};
