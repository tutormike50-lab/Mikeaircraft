const baseHandler=require("./overlay-wrapper-v12.js");
const {normalizeAirportCode}=require("./config/airports.js");
const {applyOverlayV13}=require("./overlay/patch-v13.js");

module.exports=async function handler(req,res){
  const originalSend=res.send.bind(res);
  const pinnedAirport=normalizeAirportCode(req.query?.airport||"PRG");
  res.send=function patchedSend(body){
    if(typeof body!=="string")return originalSend(body);
    return originalSend(applyOverlayV13(body,pinnedAirport));
  };
  return baseHandler(req,res);
};
