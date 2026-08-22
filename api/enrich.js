// MikeAircraft Enrichment Service
// Modular registry-backed version.
const {lookupOperator}=require("../lib/data/operators.js");
const {lookupAircraftType}=require("../lib/data/aircraft-types.js");

module.exports=async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Cache-Control","no-store");
  try{
    const callsign=String(req.query.callsign||"").trim().toUpperCase();
    const typeCode=String(req.query.type||"").trim().toUpperCase();
    if(!callsign&&!typeCode)return res.status(400).json({ok:false,error:"Missing callsign or type"});

    const op=lookupOperator(callsign);
    const operator=op?{identified:op.identified,icao:op.icao,iata:op.iata,name:op.name}:null;
    const flight=op?{operationalNumber:op.operationalNumber,display:op.display}:null;
    const aircraft=lookupAircraftType(typeCode);

    return res.status(200).json({ok:true,service:"MikeAircraft Enrichment",version:"0.3",callsign:callsign||null,operator,flight,aircraft});
  }catch(error){
    console.error("MikeAircraft enrichment error:",error);
    return res.status(500).json({ok:false,service:"MikeAircraft Enrichment",version:"0.3",error:error.message});
  }
};
