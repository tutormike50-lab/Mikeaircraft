// MikeAircraft Aircraft Graphic
// Version 0.1
//
// Returns a transparent SVG aircraft side-profile
// selected from the ICAO aircraft type code.
//
// This is the first graphics-control layer.
// Artwork can be replaced later without changing
// the overlay or broadcast logic.

module.exports = async function handler(req, res) {
  res.setHeader(
    "Content-Type",
    "image/svg+xml; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=86400, stale-while-revalidate=604800"
  );

  try {
    const type =
      String(req.query.type || "")
        .trim()
        .toUpperCase();

    const direction =
      String(req.query.direction || "RIGHT")
        .trim()
        .toUpperCase();

    // =====================================================
    // FAMILY DETECTION
    // =====================================================

    function familyFromType(code) {
      if (!code) {
        return "GENERIC";
      }

      if (
        [
          "A318",
          "A319",
          "A320",
          "A321",
          "A19N",
          "A20N",
          "A21N"
        ].includes(code)
      ) {
        return "AIRBUS_NARROW";
      }

      if (
        [
          "B737",
          "B738",
          "B739",
          "B38M",
          "B39M"
        ].includes(code)
      ) {
        return "BOEING_737";
      }

      if (
        [
          "B788",
          "B789",
          "B78X"
        ].includes(code)
      ) {
        return "BOEING_787";
      }

      if (
        [
          "B772",
          "B773",
          "B77L",
          "B77W"
        ].includes(code)
      ) {
        return "BOEING_777";
      }

      if (
        [
          "A359",
          "A35K"
        ].includes(code)
      ) {
        return "AIRBUS_A350";
      }

      if (
        code === "A388"
      ) {
        return "AIRBUS_A380";
      }

      if (
        [
          "BCS1",
          "BCS3"
        ].includes(code)
      ) {
        return "AIRBUS_A220";
      }

      if (
        [
          "E170",
          "E175",
          "E190",
          "E195",
          "E290",
          "E295",
          "E75S"
        ].includes(code)
      ) {
        return "EMBRAER";
      }

      if (
        [
          "AT43",
          "AT45",
          "AT46",
          "AT72",
          "AT75",
          "AT76"
        ].includes(code)
      ) {
        return "ATR";
      }

      if (
        [
          "DH8A",
          "DH8B",
          "DH8C",
          "DH8D"
        ].includes(code)
      ) {
        return "DASH8";
      }

      return "GENERIC";
    }

    const family =
      familyFromType(type);

    // =====================================================
    // SIMPLE PROFILE GEOMETRY
    //
    // We vary proportions enough to make families
    // recognisable at overlay size.
    // =====================================================

    const geometry = {
      AIRBUS_NARROW: {
        fuselage: 540,
        bodyY: 112,
        bodyH: 48,
        nose: 35,
        tail: 50,
        wingX: 265,
        wingSpan: 120,
        tailX: 500,
        tailH: 78
      },

      BOEING_737: {
        fuselage: 555,
        bodyY: 112,
        bodyH: 46,
        nose: 40,
        tail: 52,
        wingX: 285,
        wingSpan: 125,
        tailX: 515,
        tailH: 82
      },

      BOEING_787: {
        fuselage: 610,
        bodyY: 108,
        bodyH: 52,
        nose: 42,
        tail: 58,
        wingX: 315,
        wingSpan: 150,
        tailX: 560,
        tailH: 88
      },

      BOEING_777: {
        fuselage: 625,
        bodyY: 106,
        bodyH: 56,
        nose: 44,
        tail: 60,
        wingX: 320,
        wingSpan: 155,
        tailX: 575,
        tailH: 92
      },

      AIRBUS_A350: {
        fuselage: 615,
        bodyY: 108,
        bodyH: 52,
        nose: 45,
        tail: 58,
        wingX: 315,
        wingSpan: 152,
        tailX: 565,
        tailH: 90
      },

      AIRBUS_A380: {
        fuselage: 630,
        bodyY: 98,
        bodyH: 66,
        nose: 45,
        tail: 62,
        wingX: 325,
        wingSpan: 160,
        tailX: 578,
        tailH: 98
      },

      AIRBUS_A220: {
        fuselage: 520,
        bodyY: 112,
        bodyH: 46,
        nose: 36,
        tail: 50,
        wingX: 265,
        wingSpan: 118,
        tailX: 480,
        tailH: 80
      },

      EMBRAER: {
        fuselage: 490,
        bodyY: 114,
        bodyH: 42,
        nose: 34,
        tail: 46,
        wingX: 250,
        wingSpan: 108,
        tailX: 452,
        tailH: 74
      },

      ATR: {
        fuselage: 455,
        bodyY: 116,
        bodyH: 42,
        nose: 32,
        tail: 44,
        wingX: 235,
        wingSpan: 102,
        tailX: 418,
        tailH: 68
      },

      DASH8: {
        fuselage: 465,
        bodyY: 116,
        bodyH: 42,
        nose: 32,
        tail: 46,
        wingX: 240,
        wingSpan: 104,
        tailX: 428,
        tailH: 70
      },

      GENERIC: {
        fuselage: 500,
        bodyY: 112,
        bodyH: 46,
        nose: 36,
        tail: 48,
        wingX: 255,
        wingSpan: 112,
        tailX: 460,
        tailH: 76
      }
    };

    const g =
      geometry[family];

    const width = 700;
    const height = 250;

    const flip =
      direction === "LEFT";

    const transform =
      flip
        ? `translate(${width} 0) scale(-1 1)`
        : "";

    const bodyLeft = 70;
    const bodyRight =
      bodyLeft + g.fuselage;

    const bodyTop =
      g.bodyY;

    const bodyBottom =
      g.bodyY + g.bodyH;

    const midY =
      g.bodyY + g.bodyH / 2;

    // =====================================================
    // SVG
    // =====================================================

    const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>

  <g transform="${transform}">

    <!-- soft broadcast shadow -->
    <ellipse
      cx="350"
      cy="205"
      rx="250"
      ry="12"
      fill="rgba(0,0,0,0.18)"
    />

    <!-- main fuselage -->
    <path
      d="
        M ${bodyLeft} ${midY}
        C ${bodyLeft + 12} ${bodyTop - 4},
          ${bodyLeft + 28} ${bodyTop},
          ${bodyLeft + 55} ${bodyTop}

        L ${bodyRight - g.tail} ${bodyTop}

        C ${bodyRight - 20} ${bodyTop},
          ${bodyRight - 5} ${midY - 9},
          ${bodyRight} ${midY}

        C ${bodyRight - 5} ${midY + 9},
          ${bodyRight - 20} ${bodyBottom},
          ${bodyRight - g.tail} ${bodyBottom}

        L ${bodyLeft + 55} ${bodyBottom}

        C ${bodyLeft + 28} ${bodyBottom},
          ${bodyLeft + 12} ${bodyBottom + 4},
          ${bodyLeft} ${midY}

        Z
      "
      fill="#dce8f1"
      stroke="#8fb5cc"
      stroke-width="2"
    />

    <!-- cockpit -->
    <path
      d="
        M ${bodyLeft + 24} ${bodyTop + 8}
        L ${bodyLeft + 54} ${bodyTop + 8}
        L ${bodyLeft + 42} ${midY - 1}
        L ${bodyLeft + 18} ${midY - 2}
        Z
      "
      fill="#143954"
    />

    <!-- windows -->
    <line
      x1="${bodyLeft + 70}"
      y1="${midY - 7}"
      x2="${bodyRight - 72}"
      y2="${midY - 7}"
      stroke="#3c6f8f"
      stroke-width="3"
      stroke-dasharray="7 8"
    />

    <!-- main wing -->
    <path
      d="
        M ${g.wingX} ${midY + 2}
        L ${g.wingX - 88} ${midY + g.wingSpan}
        L ${g.wingX - 42} ${midY + g.wingSpan}
        L ${g.wingX + 92} ${midY + 8}
        Z
      "
      fill="#b9cad6"
      stroke="#7fa4b9"
      stroke-width="2"
    />

    <!-- far wing -->
    <path
      d="
        M ${g.wingX + 22} ${midY - 2}
        L ${g.wingX + 105} ${midY - 72}
        L ${g.wingX + 70} ${midY - 72}
        L ${g.wingX - 18} ${midY - 5}
        Z
      "
      fill="#aebfcb"
      stroke="#7898ab"
      stroke-width="2"
    />

    <!-- horizontal stabiliser -->
    <path
      d="
        M ${g.tailX} ${midY + 1}
        L ${g.tailX - 52} ${midY + 44}
        L ${g.tailX - 20} ${midY + 44}
        L ${g.tailX + 32} ${midY + 5}
        Z
      "
      fill="#b9cad6"
      stroke="#7fa4b9"
      stroke-width="2"
    />

    <!-- vertical tail -->
    <path
      d="
        M ${g.tailX + 2} ${bodyTop + 2}
        L ${g.tailX + 30} ${bodyTop - g.tailH}
        L ${g.tailX + 58} ${bodyTop + 4}
        Z
      "
      fill="#2f8fc5"
      stroke="#206990"
      stroke-width="2"
    />

    <!-- engines -->
    <ellipse
      cx="${g.wingX - 18}"
      cy="${midY + 48}"
      rx="25"
      ry="14"
      fill="#9fb5c3"
      stroke="#6d8ea2"
      stroke-width="2"
    />

    <ellipse
      cx="${g.wingX + 55}"
      cy="${midY + 30}"
      rx="23"
      ry="13"
      fill="#9fb5c3"
      stroke="#6d8ea2"
      stroke-width="2"
    />

    <!-- subtle highlight -->
    <line
      x1="${bodyLeft + 68}"
      y1="${bodyTop + 5}"
      x2="${bodyRight - 85}"
      y2="${bodyTop + 5}"
      stroke="rgba(255,255,255,0.55)"
      stroke-width="2"
    />

  </g>

</svg>
`;

    return res
      .status(200)
      .send(svg);
  }

  catch (error) {
    return res
      .status(500)
      .send(`
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="500"
  height="180"
  viewBox="0 0 500 180"
>
  <text
    x="20"
    y="90"
    fill="white"
    font-family="Arial"
    font-size="18"
  >
    Aircraft graphic unavailable
  </text>
</svg>
      `);
  }
};
