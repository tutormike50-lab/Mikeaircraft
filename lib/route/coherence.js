const {endpointMatchesAirport}=require("../config/airports.js");

function evaluateRouteCoherence({route,movement,airportCode}){
  if(!(route?.found&&route.origin&&route.destination)) return {checked:false,accepted:false,reason:"No complete route"};
  const lineage=String(movement?.lineage||"").toUpperCase();
  if(lineage==="ARRIVAL") return endpointMatchesAirport(route.destination,airportCode)
    ? {checked:true,accepted:true,reason:"Arrival destination matches watched airport"}
    : {checked:true,accepted:false,reason:"Arrival destination conflicts with watched airport"};
  if(lineage==="DEPARTURE") return endpointMatchesAirport(route.origin,airportCode)
    ? {checked:true,accepted:true,reason:"Departure origin matches watched airport"}
    : {checked:true,accepted:false,reason:"Departure origin conflicts with watched airport"};
  return endpointMatchesAirport(route.origin,airportCode)||endpointMatchesAirport(route.destination,airportCode)
    ? {checked:true,accepted:true,reason:"Watched airport matches one route endpoint while lineage is uncertain"}
    : {checked:true,accepted:false,reason:"Route does not include watched airport"};
}
function guardRoute(route,movement,airportCode){
  const result=evaluateRouteCoherence({route,movement,airportCode});
  if(!route?.found||result.accepted) return {route,result};
  return {route:{...route,found:false,display:null,map:null,suppressed:true,suppressedReason:result.reason},result};
}

module.exports={evaluateRouteCoherence,guardRoute};
