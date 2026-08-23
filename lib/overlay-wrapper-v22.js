const baseHandler = require("./overlay-wrapper-v21.js");

// MikeAircraft Overlay v2.2
// Arrival ticker: APPROACHING (orange) -> FINAL APPROACH (yellow) -> LANDED (green).
module.exports = async function handler(req, res) {
  const originalSend = res.send.bind(res);

  res.send = function patchedSend(body) {
    if (typeof body !== "string") return originalSend(body);
    let html = body.replaceAll("Overlay v2.1", "Overlay v2.2");

    // Add simple colour-coded arrival stages to the ticker label/text.
    html = html.replace("</style>", `
      #storyLabel.arrival-approaching,#storyText.arrival-approaching{color:#ff9f2f!important}
      #storyLabel.arrival-final,#storyText.arrival-final{color:#ffd84a!important}
      #storyLabel.arrival-landed,#storyText.arrival-landed{color:#43f59a!important}
    </style>`);

    // v2.1 suppressed landed arrivals. v2.2 keeps LANDED as the final simple stage.
    html = html.replace(
      'if(lineageForState==="ARRIVAL"){if(["LANDED","TAXIING_IN"].includes(rawState)){stopLiveDistanceTicker();hideStoryTicker();return}state=(rawState==="ON_FINAL"||String(current.movement?.displayState||"").toUpperCase().includes("FINAL"))?"FINAL APPROACH":"APPROACHING"}',
      'if(lineageForState==="ARRIVAL"){state=["LANDED","TAXIING_IN"].includes(rawState)?"LANDED":((rawState==="ON_FINAL"||String(current.movement?.displayState||"").toUpperCase().includes("FINAL"))?"FINAL APPROACH":"APPROACHING")}'
    );

    // Apply stage colour whenever live ticker text is rendered.
    html = html.replace(
      'setText("storyLabel","LIVE");setText("storyText",text);',
      'setText("storyLabel","LIVE");setText("storyText",text);const sl=document.getElementById("storyLabel"),st=document.getElementById("storyText");if(sl&&st){["arrival-approaching","arrival-final","arrival-landed"].forEach(c=>{sl.classList.remove(c);st.classList.remove(c)});if(lineageForState==="ARRIVAL"){const c=state==="LANDED"?"arrival-landed":state==="FINAL APPROACH"?"arrival-final":"arrival-approaching";sl.classList.add(c);st.classList.add(c)}}'
    );

    return originalSend(html);
  };

  return baseHandler(req, res);
};
